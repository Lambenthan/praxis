// Read-only bridge to the user's local Zotero library. Zotero stays the single
// source of truth: we never write to zotero.sqlite (Zotero warns third-party
// writes can corrupt it). Reads go through a SNAPSHOT COPY in the app cache dir
// so Zotero's own exclusive lock (held while the app runs) never blocks us and
// we never race a live transaction. PDFs are served straight from
// ~/Zotero/storage via the preview server's read-only "z" scope.
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// The default Zotero data directory (`~/Zotero` on macOS/Windows/Linux —
/// Zotero has used this one location since v5).
pub fn zotero_data_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok_or("no home directory")?;
    let dir = PathBuf::from(home).join("Zotero");
    if dir.join("zotero.sqlite").is_file() {
        Ok(dir)
    } else {
        Err("no Zotero library found (~/Zotero/zotero.sqlite)".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroCollection {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroCreator {
    #[serde(default)]
    pub first: String,
    #[serde(default)]
    pub last: String,
    pub kind: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroAttachment {
    pub key: String,
    pub title: String,
    pub content_type: String,
    /// Path relative to the Zotero data dir ("storage/KEY/file.pdf") for
    /// stored files; None for linked/URL-only attachments we can't serve.
    pub rel_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroItem {
    pub key: String,
    pub item_type: String,
    pub title: String,
    pub creators: Vec<ZoteroCreator>,
    pub year: Option<i32>,
    pub tags: Vec<String>,
    /// All non-empty Zotero fields (fieldName -> value), title included.
    pub fields: std::collections::BTreeMap<String, String>,
    pub collection_ids: Vec<i64>,
    pub attachments: Vec<ZoteroAttachment>,
    pub date_added: String,
    pub date_modified: String,
    /// Fishes-library items can sit in the trash; Zotero reads never set this
    /// (deleted Zotero items are excluded outright).
    pub trashed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroLibrary {
    pub data_dir: String,
    pub collections: Vec<ZoteroCollection>,
    pub items: Vec<ZoteroItem>,
}

fn first_year(date: &str) -> Option<i32> {
    // Zotero's date field is multipart free-form ("2023-05-01", "May 2023 2023-05", …);
    // the year is the first 4-digit run.
    let bytes = date.as_bytes();
    let mut i = 0;
    while i + 4 <= bytes.len() {
        if bytes[i..i + 4].iter().all(u8::is_ascii_digit)
            && (i + 4 == bytes.len() || !bytes[i + 4].is_ascii_digit())
            && (i == 0 || !bytes[i - 1].is_ascii_digit())
        {
            return date[i..i + 4].parse().ok();
        }
        i += 1;
    }
    None
}

/// Copy zotero.sqlite into the app cache and open the copy read-only.
pub fn open_snapshot(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let src = zotero_data_dir()?.join("zotero.sqlite");
    let cache = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("no cache dir: {e}"))?;
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let snap = cache.join("zotero-snapshot.sqlite");
    std::fs::copy(&src, &snap).map_err(|e| format!("cannot copy Zotero db: {e}"))?;
    rusqlite::Connection::open_with_flags(
        &snap,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("cannot open Zotero db: {e}"))
}

/// The whole user library (libraryID 1): collections + top-level items with
/// creators, tags, fields, collection membership, and stored attachments.
#[tauri::command]
pub fn zotero_library(app: AppHandle) -> Result<ZoteroLibrary, String> {
    use std::collections::{BTreeMap, HashMap};
    let data_dir = zotero_data_dir()?;
    let conn = open_snapshot(&app)?;
    let q = |e: rusqlite::Error| e.to_string();

    let mut collections = Vec::new();
    {
        let mut st = conn
            .prepare(
                "SELECT collectionID, parentCollectionID, collectionName FROM collections
                 WHERE libraryID = 1 ORDER BY collectionName COLLATE NOCASE",
            )
            .map_err(q)?;
        let rows = st
            .query_map([], |r| {
                Ok(ZoteroCollection { id: r.get(0)?, parent_id: r.get(1)?, name: r.get(2)? })
            })
            .map_err(q)?;
        for c in rows {
            collections.push(c.map_err(q)?);
        }
    }

    // Per-item lookups gathered in bulk (the library is small — thousands at
    // most — so full-table maps beat N+1 queries and keep the SQL trivial).
    let mut fields: HashMap<i64, BTreeMap<String, String>> = HashMap::new();
    {
        let mut st = conn
            .prepare(
                "SELECT d.itemID, f.fieldName, v.value FROM itemData d
                 JOIN fields f ON f.fieldID = d.fieldID
                 JOIN itemDataValues v ON v.valueID = d.valueID",
            )
            .map_err(q)?;
        let rows = st
            .query_map([], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?))
            })
            .map_err(q)?;
        for row in rows {
            let (id, name, value) = row.map_err(q)?;
            if !value.is_empty() {
                fields.entry(id).or_default().insert(name, value);
            }
        }
    }

    let mut creators: HashMap<i64, Vec<ZoteroCreator>> = HashMap::new();
    {
        let mut st = conn
            .prepare(
                "SELECT ic.itemID, c.firstName, c.lastName, ct.creatorType FROM itemCreators ic
                 JOIN creators c ON c.creatorID = ic.creatorID
                 JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID
                 ORDER BY ic.itemID, ic.orderIndex",
            )
            .map_err(q)?;
        let rows = st
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    ZoteroCreator {
                        first: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                        last: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                        kind: r.get(3)?,
                    },
                ))
            })
            .map_err(q)?;
        for row in rows {
            let (id, c) = row.map_err(q)?;
            creators.entry(id).or_default().push(c);
        }
    }

    let mut tags: HashMap<i64, Vec<String>> = HashMap::new();
    {
        let mut st = conn
            .prepare(
                "SELECT it.itemID, t.name FROM itemTags it
                 JOIN tags t ON t.tagID = it.tagID ORDER BY t.name COLLATE NOCASE",
            )
            .map_err(q)?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(q)?;
        for row in rows {
            let (id, t) = row.map_err(q)?;
            tags.entry(id).or_default().push(t);
        }
    }

    let mut memberships: HashMap<i64, Vec<i64>> = HashMap::new();
    {
        let mut st = conn
            .prepare("SELECT itemID, collectionID FROM collectionItems")
            .map_err(q)?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
            .map_err(q)?;
        for row in rows {
            let (item, coll) = row.map_err(q)?;
            memberships.entry(item).or_default().push(coll);
        }
    }

    // Stored child attachments, keyed by parent. `path` is "storage:FILENAME"
    // for files Zotero manages (they live at storage/<attachmentKey>/FILENAME);
    // linked files/URLs have other forms and are listed without a servable path.
    let mut attachments: HashMap<i64, Vec<ZoteroAttachment>> = HashMap::new();
    {
        let mut st = conn
            .prepare(
                "SELECT ia.parentItemID, i.itemID, i.key, ia.contentType, ia.path
                 FROM itemAttachments ia JOIN items i ON i.itemID = ia.itemID
                 WHERE ia.parentItemID IS NOT NULL
                   AND i.itemID NOT IN (SELECT itemID FROM deletedItems)",
            )
            .map_err(q)?;
        let rows = st
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(q)?;
        for row in rows {
            let (parent, att_id, key, content_type, path) = row.map_err(q)?;
            let rel_path = path.as_deref().and_then(|p| {
                p.strip_prefix("storage:").map(|f| format!("storage/{key}/{f}"))
            });
            let title = fields
                .get(&att_id)
                .and_then(|f| f.get("title").cloned())
                .or_else(|| path.as_deref().map(|p| p.trim_start_matches("storage:").to_string()))
                .unwrap_or_else(|| key.clone());
            attachments.entry(parent).or_default().push(ZoteroAttachment {
                key,
                title,
                content_type: content_type.unwrap_or_default(),
                rel_path,
            });
        }
    }

    let mut items = Vec::new();
    {
        let mut st = conn
            .prepare(
                "SELECT i.itemID, i.key, it.typeName, i.dateAdded, i.dateModified
                 FROM items i JOIN itemTypes it ON it.itemTypeID = i.itemTypeID
                 WHERE i.libraryID = 1
                   AND it.typeName NOT IN ('attachment', 'note', 'annotation')
                   AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
                 ORDER BY i.dateAdded DESC",
            )
            .map_err(q)?;
        let rows = st
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })
            .map_err(q)?;
        for row in rows {
            let (id, key, item_type, date_added, date_modified) = row.map_err(q)?;
            let f = fields.remove(&id).unwrap_or_default();
            let title = f.get("title").cloned().unwrap_or_else(|| "(untitled)".into());
            let year = f.get("date").and_then(|d| first_year(d));
            items.push(ZoteroItem {
                key,
                item_type,
                title,
                creators: creators.remove(&id).unwrap_or_default(),
                year,
                tags: tags.remove(&id).unwrap_or_default(),
                fields: f,
                collection_ids: memberships.remove(&id).unwrap_or_default(),
                attachments: attachments.remove(&id).unwrap_or_default(),
                date_added,
                date_modified,
                trashed: false,
            });
        }
    }

    Ok(ZoteroLibrary {
        data_dir: data_dir.to_string_lossy().into_owned(),
        collections,
        items,
    })
}

/// Open an item in the Zotero app itself (select it in the pane). Uses the
/// zotero:// scheme; silently does nothing if Zotero isn't installed.
#[tauri::command]
pub fn zotero_select(item_key: String) -> Result<(), String> {
    if !item_key.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("bad item key".into());
    }
    opener::open(format!("zotero://select/library/items/{item_key}")).map_err(|e| e.to_string())
}
