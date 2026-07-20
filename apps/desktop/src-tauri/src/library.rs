// Fishes's own literature library — a Zotero-shaped store the app fully owns.
// Layout mirrors Zotero's: one SQLite db + a storage/ tree of per-attachment
// folders, at <workspace base>/library (visible, backed up with the user's
// research home, and servable through the existing "base" preview scope):
//
//   <base>/library/library.sqlite
//   <base>/library/storage/<ATTKEY>/<original file name>
//
// Items keep their flexible metadata as a JSON field map (same field names as
// Zotero: title, date, publicationTitle, DOI, …) so any Zotero item imports
// losslessly without an EAV schema. All writes go through here; the Zotero
// bridge (zotero.rs) stays read-only and feeds the one-shot import.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::zotero::{ZoteroAttachment, ZoteroCollection, ZoteroCreator, ZoteroItem, ZoteroLibrary};

/// The library belongs to the ACTIVE PROJECT: `<workspace>/literature`.
fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
    // Project-centric: the library belongs to the ACTIVE PROJECT — its papers
    // live in <workspace>/literature. This one rule fits any project location
    // (a migrated `Literature/projects/<name>`, or a folder the user opened).
    // With no project open (the blank scratch base) it falls back to
    // <base>/literature. The pre-2026-07 global catalog is split into these
    // per-project libraries by `migrate_catalog_to_projects` at startup.
    let ws = crate::runtime::workspace_dir(app)
        .or_else(|_| crate::runtime::base_workspace_dir(app))?;
    Ok(ws.join("literature"))
}

/// Startup migration: fold the legacy flat `<base>/library` into the catalog if
/// present, then split the global `<base>/Literature/catalog` into per-project
/// libraries. Idempotent and self-locating; safe to call on every launch.
pub fn migrate_catalog_to_projects(app: &AppHandle) {
    let Ok(base) = crate::runtime::base_workspace_dir(app) else {
        return;
    };
    // Lift any projects an earlier build split under `<base>/Literature/projects/`
    // up to top-level `<base>/<name>` folders (each already holds literature/ and
    // wiki/). Idempotent: only moves when the destination is free.
    let legacy_projects = base.join("Literature").join("projects");
    if legacy_projects.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&legacy_projects) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    let dest = base.join(entry.file_name());
                    if !dest.exists() {
                        let _ = std::fs::rename(entry.path(), &dest);
                    }
                }
            }
        }
    }
    let catalog = base.join("Literature").join("catalog");
    let legacy = base.join("library");
    if !catalog.exists() && legacy.join("library.sqlite").is_file() {
        if let Some(parent) = catalog.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::rename(&legacy, &catalog);
    }
    match split_catalog_to_projects(&base) {
        Ok(split) if !split.projects.is_empty() => {
            eprintln!("catalog→projects split: {:?}", split.projects);
        }
        Err(e) => eprintln!("catalog→projects split failed: {e}"),
        _ => {}
    }
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let dir = library_dir(app)?;
    std::fs::create_dir_all(dir.join("storage")).map_err(|e| e.to_string())?;
    let conn = Connection::open(dir.join("library.sqlite")).map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS items (
           id INTEGER PRIMARY KEY,
           key TEXT UNIQUE NOT NULL,
           itemType TEXT NOT NULL DEFAULT 'journalArticle',
           fields TEXT NOT NULL DEFAULT '{}',
           trashed INTEGER NOT NULL DEFAULT 0,
           dateAdded TEXT NOT NULL DEFAULT (datetime('now')),
           dateModified TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE TABLE IF NOT EXISTS creators (
           itemId INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
           orderIndex INTEGER NOT NULL,
           firstName TEXT NOT NULL DEFAULT '',
           lastName TEXT NOT NULL DEFAULT '',
           kind TEXT NOT NULL DEFAULT 'author'
         );
         CREATE TABLE IF NOT EXISTS collections (
           id INTEGER PRIMARY KEY,
           parentId INTEGER REFERENCES collections(id) ON DELETE CASCADE,
           name TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS collectionItems (
           collectionId INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
           itemId INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
           PRIMARY KEY (collectionId, itemId)
         );
         CREATE TABLE IF NOT EXISTS tags (
           id INTEGER PRIMARY KEY,
           name TEXT UNIQUE NOT NULL
         );
         CREATE TABLE IF NOT EXISTS itemTags (
           itemId INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
           tagId INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
           PRIMARY KEY (itemId, tagId)
         );
         CREATE TABLE IF NOT EXISTS attachments (
           id INTEGER PRIMARY KEY,
           itemId INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
           key TEXT UNIQUE NOT NULL,
           title TEXT NOT NULL DEFAULT '',
           contentType TEXT NOT NULL DEFAULT '',
           fileName TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS annotations (
           id INTEGER PRIMARY KEY,
           attachmentKey TEXT NOT NULL,
           page INTEGER NOT NULL,
           kind TEXT NOT NULL DEFAULT 'highlight',
           color TEXT NOT NULL DEFAULT '#ffd400',
           rects TEXT NOT NULL,
           quoted TEXT NOT NULL DEFAULT '',
           comment TEXT NOT NULL DEFAULT '',
           dateAdded TEXT NOT NULL DEFAULT (datetime('now')),
           dateModified TEXT NOT NULL DEFAULT (datetime('now'))
         );
         CREATE INDEX IF NOT EXISTS annotations_attachment ON annotations(attachmentKey, page);",
    )
    .map_err(|e| e.to_string())
}

fn new_key() -> String {
    crate::runtime::random_hex(4).to_uppercase() // 8 hex chars, Zotero-key sized
}

// ---------------------------------------------------------------------------
// Catalog → per-project split (project-centric model, 2026-07)
//
// The pre-2026-07 layout kept ONE global library at <base>/Literature/catalog
// with sub-research "collections" as tags. The project-centric model gives each
// project its own self-contained library at
//   <base>/<project>/literature/{library.sqlite,storage/}
// so a project's papers sit beside its data, wiki, and conversations.
//
// This split is AUTOMATIC and SELF-LOCATING: it derives every path from `base`
// (the app resolves that identically on any machine — it created the catalog
// there), so the shipped code migrates any user's install with no per-machine
// knowledge. Idempotent: once done, the old catalog is retired to
// `catalog.pre-projects-bak` and this no-ops.
// ---------------------------------------------------------------------------

/// Per-project counts produced by a split, for the honest post-migration report.
#[derive(Debug, Default, Clone, Serialize)]
pub struct CatalogSplit {
    pub projects: Vec<(String, usize)>,
    pub attachments_copied: usize,
}

fn safe_project_name(name: &str) -> String {
    let s = name.replace(['/', '\\', ':'], "_").trim().to_string();
    if s.is_empty() { "全库".into() } else { s }
}

/// Recursively copy a directory tree (used for an attachment's storage/<KEY>/).
fn copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &target)?;
        } else {
            std::fs::copy(&path, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Copy one item (row + creators + tags + attachments + annotations, and each
/// attachment's storage folder) from the source catalog into a project db.
/// Keys are preserved; a key already present in the destination is skipped
/// (an item shared by two projects lands once per project). Returns the number
/// of attachment storage folders copied.
fn copy_item(
    src: &Connection,
    dest: &Connection,
    src_id: i64,
    src_catalog: &Path,
    dest_lib: &Path,
) -> Result<usize, String> {
    let (key, item_type, fields, trashed, added, modified): (String, String, String, i64, String, String) = src
        .query_row(
            "SELECT key,itemType,fields,trashed,dateAdded,dateModified FROM items WHERE id=?1",
            [src_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .map_err(|e| e.to_string())?;
    let exists: i64 = dest
        .query_row("SELECT COUNT(*) FROM items WHERE key=?1", [&key], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if exists > 0 {
        return Ok(0);
    }
    dest.execute(
        "INSERT INTO items(key,itemType,fields,trashed,dateAdded,dateModified) VALUES(?1,?2,?3,?4,?5,?6)",
        rusqlite::params![key, item_type, fields, trashed, added, modified],
    )
    .map_err(|e| e.to_string())?;
    let new_id = dest.last_insert_rowid();

    let mut st = src
        .prepare("SELECT orderIndex,firstName,lastName,kind FROM creators WHERE itemId=?1")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([src_id], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (oi, f, l, k) = row.map_err(|e| e.to_string())?;
        dest.execute(
            "INSERT INTO creators(itemId,orderIndex,firstName,lastName,kind) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![new_id, oi, f, l, k],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut st = src
        .prepare("SELECT t.name FROM itemTags it JOIN tags t ON t.id=it.tagId WHERE it.itemId=?1")
        .map_err(|e| e.to_string())?;
    let rows = st.query_map([src_id], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for row in rows {
        let name = row.map_err(|e| e.to_string())?;
        dest.execute("INSERT OR IGNORE INTO tags(name) VALUES(?1)", [&name]).map_err(|e| e.to_string())?;
        let tid: i64 = dest
            .query_row("SELECT id FROM tags WHERE name=?1", [&name], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        dest.execute(
            "INSERT OR IGNORE INTO itemTags(itemId,tagId) VALUES(?1,?2)",
            rusqlite::params![new_id, tid],
        )
        .map_err(|e| e.to_string())?;
    }

    let mut atts: Vec<(String, String, String, String)> = Vec::new();
    {
        let mut st = src
            .prepare("SELECT key,title,contentType,fileName FROM attachments WHERE itemId=?1 ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([src_id], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            atts.push(row.map_err(|e| e.to_string())?);
        }
    }
    let mut copied = 0;
    for (akey, title, ctype, fname) in atts {
        dest.execute(
            "INSERT INTO attachments(itemId,key,title,contentType,fileName) VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![new_id, akey, title, ctype, fname],
        )
        .map_err(|e| e.to_string())?;
        let sdir = src_catalog.join("storage").join(&akey);
        if sdir.is_dir() {
            copy_dir(&sdir, &dest_lib.join("storage").join(&akey))?;
            copied += 1;
        }
        let mut st = src
            .prepare("SELECT page,kind,color,rects,quoted,comment,dateAdded,dateModified FROM annotations WHERE attachmentKey=?1")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([&akey], |r| {
                Ok((
                    r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?, r.get::<_, String>(5)?, r.get::<_, String>(6)?, r.get::<_, String>(7)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (page, kind, color, rects, quoted, comment, da, dm) = row.map_err(|e| e.to_string())?;
            dest.execute(
                "INSERT INTO annotations(attachmentKey,page,kind,color,rects,quoted,comment,dateAdded,dateModified) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                rusqlite::params![akey, page, kind, color, rects, quoted, comment, da, dm],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    Ok(copied)
}

/// Split `<base>/Literature/catalog` into `<base>/Literature/projects/<name>/literature`.
/// No-op (returns empty) when there is no catalog to migrate.
fn split_catalog_to_projects(base: &Path) -> Result<CatalogSplit, String> {
    let catalog = base.join("Literature").join("catalog");
    let db_path = catalog.join("library.sqlite");
    if !db_path.is_file() {
        return Ok(CatalogSplit::default());
    }
    let src = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut colnames: std::collections::HashMap<i64, String> = std::collections::HashMap::new();
    {
        let mut st = src.prepare("SELECT id, name FROM collections").map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (id, name) = row.map_err(|e| e.to_string())?;
            colnames.insert(id, name);
        }
    }
    let mut item_cols: std::collections::HashMap<i64, Vec<i64>> = std::collections::HashMap::new();
    {
        let mut st = src.prepare("SELECT itemId, collectionId FROM collectionItems").map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;
        for row in rows {
            let (iid, cid) = row.map_err(|e| e.to_string())?;
            item_cols.entry(iid).or_default().push(cid);
        }
    }
    let mut item_ids = Vec::new();
    {
        let mut st = src.prepare("SELECT id FROM items ORDER BY id").map_err(|e| e.to_string())?;
        let rows = st.query_map([], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
        for r in rows {
            item_ids.push(r.map_err(|e| e.to_string())?);
        }
    }

    // A project is a top-level folder (like a gate-created ~/Fishes/<name>);
    // its papers live in <project>/literature. No `Literature/projects/` nesting.
    let proj_lib = |name: &str| base.join(name).join("literature");
    let mut dest_conns: std::collections::HashMap<String, Connection> = std::collections::HashMap::new();
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut copied = 0usize;

    for iid in item_ids {
        let targets: Vec<String> = match item_cols.get(&iid) {
            Some(cids) if !cids.is_empty() => {
                cids.iter().filter_map(|c| colnames.get(c)).map(|n| safe_project_name(n)).collect()
            }
            _ => vec!["全库".into()],
        };
        let targets = if targets.is_empty() { vec!["全库".into()] } else { targets };
        for tname in targets {
            if !dest_conns.contains_key(&tname) {
                let dir = proj_lib(&tname);
                std::fs::create_dir_all(dir.join("storage")).map_err(|e| e.to_string())?;
                let c = Connection::open(dir.join("library.sqlite")).map_err(|e| e.to_string())?;
                init_schema(&c)?;
                dest_conns.insert(tname.clone(), c);
            }
            let dest = dest_conns.get(&tname).unwrap();
            copied += copy_item(&src, dest, iid, &catalog, &proj_lib(&tname))?;
            *counts.entry(tname.clone()).or_insert(0) += 1;
        }
    }
    drop(dest_conns);
    drop(src);

    let bak = base.join("Literature").join("catalog.pre-projects-bak");
    if !bak.exists() {
        std::fs::rename(&catalog, &bak).map_err(|e| format!("retire catalog: {e}"))?;
    }
    Ok(CatalogSplit { projects: counts.into_iter().collect(), attachments_copied: copied })
}

fn touch(conn: &Connection, item_id: i64) {
    let _ = conn.execute(
        "UPDATE items SET dateModified = datetime('now') WHERE id = ?1",
        [item_id],
    );
}

fn item_id(conn: &Connection, key: &str) -> Result<i64, String> {
    conn.query_row("SELECT id FROM items WHERE key = ?1", [key], |r| r.get(0))
        .map_err(|_| format!("no such item: {key}"))
}

fn parse_fields(json: &str) -> BTreeMap<String, String> {
    serde_json::from_str(json).unwrap_or_default()
}

fn first_year(date: &str) -> Option<i32> {
    let b = date.as_bytes();
    (0..b.len().saturating_sub(3)).find_map(|i| {
        let run4 = b[i..i + 4].iter().all(u8::is_ascii_digit);
        let bounded = (i == 0 || !b[i - 1].is_ascii_digit())
            && (i + 4 == b.len() || !b[i + 4].is_ascii_digit());
        if run4 && bounded { date[i..i + 4].parse().ok() } else { None }
    })
}

/// Assemble one item in the same shape the Zotero bridge returns, so the
/// frontend renders both libraries with a single type.
fn load_item(conn: &Connection, id: i64) -> Result<ZoteroItem, String> {
    let (key, item_type, fields_json, trashed, date_added, date_modified) = conn
        .query_row(
            "SELECT key, itemType, fields, trashed, dateAdded, dateModified FROM items WHERE id = ?1",
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?;
    let fields = parse_fields(&fields_json);

    let mut creators = Vec::new();
    let mut st = conn
        .prepare("SELECT firstName, lastName, kind FROM creators WHERE itemId = ?1 ORDER BY orderIndex")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([id], |r| {
            Ok(ZoteroCreator { first: r.get(0)?, last: r.get(1)?, kind: r.get(2)? })
        })
        .map_err(|e| e.to_string())?;
    for c in rows {
        creators.push(c.map_err(|e| e.to_string())?);
    }

    let mut tags = Vec::new();
    let mut st = conn
        .prepare(
            "SELECT t.name FROM itemTags it JOIN tags t ON t.id = it.tagId
             WHERE it.itemId = ?1 ORDER BY t.name COLLATE NOCASE",
        )
        .map_err(|e| e.to_string())?;
    let rows = st.query_map([id], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    for t in rows {
        tags.push(t.map_err(|e| e.to_string())?);
    }

    let mut collection_ids = Vec::new();
    let mut st = conn
        .prepare("SELECT collectionId FROM collectionItems WHERE itemId = ?1")
        .map_err(|e| e.to_string())?;
    let rows = st.query_map([id], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
    for c in rows {
        collection_ids.push(c.map_err(|e| e.to_string())?);
    }

    let mut attachments = Vec::new();
    let mut st = conn
        .prepare("SELECT key, title, contentType, fileName FROM attachments WHERE itemId = ?1 ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([id], |r| {
            let key: String = r.get(0)?;
            let file: String = r.get(3)?;
            Ok(ZoteroAttachment {
                rel_path: Some(format!("storage/{key}/{file}")),
                key,
                title: r.get(1)?,
                content_type: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    for a in rows {
        attachments.push(a.map_err(|e| e.to_string())?);
    }

    let title = fields.get("title").cloned().unwrap_or_else(|| "(untitled)".into());
    let year = fields.get("date").and_then(|d| first_year(d));
    Ok(ZoteroItem {
        key,
        item_type,
        title,
        creators,
        year,
        tags,
        fields,
        collection_ids,
        attachments,
        date_added,
        date_modified,
        trashed: trashed != 0,
    })
}

fn all_items(conn: &Connection) -> Result<Vec<ZoteroItem>, String> {
    let mut ids = Vec::new();
    let mut st = conn
        .prepare("SELECT id FROM items ORDER BY dateAdded DESC, id DESC")
        .map_err(|e| e.to_string())?;
    let rows = st.query_map([], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
    for id in rows {
        ids.push(id.map_err(|e| e.to_string())?);
    }
    ids.into_iter().map(|id| load_item(conn, id)).collect()
}

#[tauri::command]
pub fn library_list(app: AppHandle) -> Result<ZoteroLibrary, String> {
    let conn = open_db(&app)?;
    let mut collections = Vec::new();
    let mut st = conn
        .prepare("SELECT id, parentId, name FROM collections ORDER BY name COLLATE NOCASE")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| {
            Ok(ZoteroCollection { id: r.get(0)?, parent_id: r.get(1)?, name: r.get(2)? })
        })
        .map_err(|e| e.to_string())?;
    for c in rows {
        collections.push(c.map_err(|e| e.to_string())?);
    }
    Ok(ZoteroLibrary {
        data_dir: library_dir(&app)?.to_string_lossy().into_owned(),
        collections,
        items: all_items(&conn)?,
    })
}

// ---------------------------------------------------------------------------
// Metadata: DOI/arXiv detection + doi.org CSL-JSON lookup
// ---------------------------------------------------------------------------

fn doi_in(text: &str) -> Option<String> {
    // The standard Crossref-recommended pattern; trailing sentence punctuation
    // (and an unbalanced ")") is trimmed off matches found in prose.
    let re = regex::Regex::new(r"(?i)\b10\.\d{4,9}/[-._;()/:<>A-Z0-9]+").ok()?;
    let m = re.find(text)?;
    let mut doi = m.as_str().trim_end_matches(['.', ',', ';', ':']).to_string();
    if doi.ends_with(')') && !doi.contains('(') {
        doi.pop();
    }
    Some(doi)
}

fn arxiv_in(text: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?i)arxiv[:\s]\s*(\d{4}\.\d{4,5})(v\d+)?").ok()?;
    Some(re.captures(text)?.get(1)?.as_str().to_string())
}

fn arxiv_in_name(name: &str) -> Option<String> {
    let re = regex::Regex::new(r"\b(\d{4}\.\d{4,5})(v\d+)?\b").ok()?;
    Some(re.captures(name)?.get(1)?.as_str().to_string())
}

fn csl_type_to_zotero(t: &str) -> &'static str {
    match t {
        "article-journal" => "journalArticle",
        "paper-conference" => "conferencePaper",
        "book" => "book",
        "chapter" => "bookSection",
        "thesis" => "thesis",
        "report" => "report",
        "dataset" => "dataset",
        "webpage" | "post" | "post-weblog" => "webpage",
        "manuscript" | "article" => "preprint",
        _ => "journalArticle",
    }
}

struct FetchedMeta {
    item_type: &'static str,
    fields: BTreeMap<String, String>,
    creators: Vec<ZoteroCreator>,
}

/// Resolve a DOI to CSL-JSON via doi.org content negotiation — one endpoint
/// that covers both Crossref and DataCite (arXiv) DOIs.
async fn fetch_csl(doi: &str) -> Result<FetchedMeta, String> {
    let url = format!("https://doi.org/{doi}");
    let resp = reqwest::Client::new()
        .get(&url)
        .header("Accept", "application/vnd.citationstyles.csl+json")
        .header("User-Agent", "Fishes/0.1 (research workbench)")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("doi.org unreachable: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("doi.org returned {} for {doi}", resp.status()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| format!("bad CSL JSON: {e}"))?;
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(str::to_string);

    let mut fields = BTreeMap::new();
    if let Some(t) = s("title") {
        fields.insert("title".into(), t);
    }
    for (csl, zot) in [
        ("container-title", "publicationTitle"),
        ("volume", "volume"),
        ("issue", "issue"),
        ("page", "pages"),
        ("publisher", "publisher"),
        ("URL", "url"),
        ("abstract", "abstractNote"),
        ("ISSN", "ISSN"),
        ("ISBN", "ISBN"),
        ("language", "language"),
    ] {
        // Some registries ship these as arrays; take the first entry then.
        let val = match v.get(csl) {
            Some(serde_json::Value::String(x)) => Some(x.clone()),
            Some(serde_json::Value::Array(a)) => {
                a.first().and_then(|x| x.as_str()).map(str::to_string)
            }
            _ => None,
        };
        if let Some(val) = val {
            if !val.is_empty() {
                fields.insert(zot.into(), val);
            }
        }
    }
    fields.insert("DOI".into(), doi.to_string());
    if let Some(parts) = v
        .get("issued")
        .and_then(|i| i.get("date-parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.as_array())
    {
        let nums: Vec<String> = parts.iter().filter_map(|n| n.as_i64()).map(|n| n.to_string()).collect();
        if !nums.is_empty() {
            fields.insert("date".into(), nums.join("-"));
        }
    }

    let mut creators = Vec::new();
    if let Some(authors) = v.get("author").and_then(|a| a.as_array()) {
        for a in authors {
            let get = |k: &str| a.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
            let (first, last) = (get("given"), get("family"));
            let last = if last.is_empty() { get("literal") } else { last };
            if !first.is_empty() || !last.is_empty() {
                creators.push(ZoteroCreator { first, last, kind: "author".into() });
            }
        }
    }

    let item_type = csl_type_to_zotero(v.get("type").and_then(|t| t.as_str()).unwrap_or(""));
    Ok(FetchedMeta { item_type, fields, creators })
}

fn insert_item(
    conn: &Connection,
    item_type: &str,
    fields: &BTreeMap<String, String>,
    creators: &[ZoteroCreator],
) -> Result<i64, String> {
    let key = new_key();
    conn.execute(
        "INSERT INTO items (key, itemType, fields) VALUES (?1, ?2, ?3)",
        rusqlite::params![key, item_type, serde_json::to_string(fields).unwrap_or_default()],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    for (i, c) in creators.iter().enumerate() {
        conn.execute(
            "INSERT INTO creators (itemId, orderIndex, firstName, lastName, kind) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, i as i64, c.first, c.last, c.kind],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(id)
}

/// File name sane enough for a storage folder (strip path separators etc.).
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':' | '\0') { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').to_string();
    if trimmed.is_empty() { "file".into() } else { trimmed }
}

fn attach_file(
    conn: &Connection,
    app: &AppHandle,
    item: i64,
    src: &std::path::Path,
    content_type: &str,
) -> Result<(), String> {
    let att_key = new_key();
    let mut file_name = safe_name(
        src.file_name().and_then(|n| n.to_str()).unwrap_or("file"),
    );
    // Extension-less PDFs (common in Zotero storage) get one so the webview's
    // extension-keyed MIME detection renders them inline.
    if content_type == "application/pdf" && !file_name.to_lowercase().ends_with(".pdf") {
        file_name.push_str(".pdf");
    }
    let dir = library_dir(app)?.join("storage").join(&att_key);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::copy(src, dir.join(&file_name)).map_err(|e| format!("copy failed: {e}"))?;
    conn.execute(
        "INSERT INTO attachments (itemId, key, title, contentType, fileName) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![item, att_key, file_name, content_type, file_name],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Native multi-file picker for "Add papers" (no JS dialog plugin in the tree;
/// same pattern as runtime::pick_folder). Returns the chosen paths, [] on cancel.
#[tauri::command]
pub async fn library_pick_pdfs(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app
        .dialog()
        .file()
        .add_filter("Documents", &["pdf", "epub", "html", "txt"])
        .blocking_pick_files()
        .unwrap_or_default();
    Ok(picked
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddResult {
    pub added: Vec<ZoteroItem>,
    pub errors: Vec<String>,
}

/// Add local files (PDFs) to the library: sniff a DOI/arXiv id out of the PDF
/// text, resolve real metadata through doi.org, fall back to a bare stub the
/// user can edit. The file is copied into library storage either way.
#[tauri::command]
pub async fn library_add_files(app: AppHandle, paths: Vec<String>) -> Result<AddResult, String> {
    let mut added = Vec::new();
    let mut errors = Vec::new();
    for p in paths {
        match add_one_file(&app, &p).await {
            Ok(item) => added.push(item),
            Err(e) => errors.push(format!("{}: {e}", file_label(&p))),
        }
    }
    Ok(AddResult { added, errors })
}

fn file_label(p: &str) -> String {
    std::path::Path::new(p)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string())
}

async fn add_one_file(app: &AppHandle, path: &str) -> Result<ZoteroItem, String> {
    let src = PathBuf::from(path);
    if !src.is_file() {
        return Err("file not found".into());
    }
    let name = file_label(path);
    let is_pdf = name.to_lowercase().ends_with(".pdf");

    // Text extraction can be slow (and pdf-extract can panic on damaged
    // files) — run it off the async thread and treat any failure as "no text".
    let text = if is_pdf {
        let src2 = src.clone();
        tauri::async_runtime::spawn_blocking(move || {
            std::panic::catch_unwind(|| pdf_extract::extract_text(&src2).unwrap_or_default())
                .unwrap_or_default()
        })
        .await
        .unwrap_or_default()
    } else {
        String::new()
    };
    let head: String = text.chars().take(20_000).collect();

    let doi = doi_in(&head)
        .or_else(|| arxiv_in(&head).map(|id| format!("10.48550/arXiv.{id}")))
        .or_else(|| arxiv_in_name(&name).map(|id| format!("10.48550/arXiv.{id}")));

    let meta = match &doi {
        Some(d) => fetch_csl(d).await.ok(),
        None => None,
    };

    let conn = open_db(app)?;
    let id = match meta {
        Some(m) => insert_item(&conn, m.item_type, &m.fields, &m.creators)?,
        None => {
            // Stub the user can fill in: title = file stem (or embedded DOI).
            let mut fields = BTreeMap::new();
            let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(&name);
            fields.insert("title".into(), stem.to_string());
            if let Some(d) = &doi {
                fields.insert("DOI".into(), d.clone());
            }
            insert_item(&conn, "journalArticle", &fields, &[])?
        }
    };
    let ctype = if is_pdf { "application/pdf" } else { "" };
    attach_file(&conn, app, id, &src, ctype)?;
    load_item(&conn, id)
}

/// Add an item by DOI alone (no file).
#[tauri::command]
pub async fn library_add_doi(app: AppHandle, doi: String) -> Result<ZoteroItem, String> {
    let doi = doi.trim().trim_start_matches("https://doi.org/").to_string();
    if doi.is_empty() {
        return Err("empty DOI".into());
    }
    let meta = fetch_csl(&doi).await?;
    let conn = open_db(&app)?;
    // Same DOI twice = the same paper; hand back the existing row instead.
    if let Ok(existing) = conn.query_row(
        "SELECT id FROM items WHERE fields LIKE ?1",
        [format!("%\"DOI\":{}%", serde_json::to_string(&doi).unwrap_or_default())],
        |r| r.get::<_, i64>(0),
    ) {
        return load_item(&conn, existing);
    }
    let id = insert_item(&conn, meta.item_type, &meta.fields, &meta.creators)?;
    load_item(&conn, id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPatch {
    pub item_type: Option<String>,
    /// Full replacement field map (empty values are dropped).
    pub fields: Option<BTreeMap<String, String>>,
    pub creators: Option<Vec<ZoteroCreator>>,
}

#[tauri::command]
pub fn library_update_item(app: AppHandle, key: String, patch: ItemPatch) -> Result<ZoteroItem, String> {
    let conn = open_db(&app)?;
    let id = item_id(&conn, &key)?;
    if let Some(t) = patch.item_type {
        conn.execute("UPDATE items SET itemType = ?1 WHERE id = ?2", rusqlite::params![t, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(mut f) = patch.fields {
        f.retain(|_, v| !v.trim().is_empty());
        conn.execute(
            "UPDATE items SET fields = ?1 WHERE id = ?2",
            rusqlite::params![serde_json::to_string(&f).unwrap_or_default(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(cs) = patch.creators {
        conn.execute("DELETE FROM creators WHERE itemId = ?1", [id]).map_err(|e| e.to_string())?;
        for (i, c) in cs.iter().enumerate() {
            conn.execute(
                "INSERT INTO creators (itemId, orderIndex, firstName, lastName, kind) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![id, i as i64, c.first, c.last, c.kind],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    touch(&conn, id);
    load_item(&conn, id)
}

#[tauri::command]
pub fn library_set_tags(app: AppHandle, key: String, tags: Vec<String>) -> Result<ZoteroItem, String> {
    let conn = open_db(&app)?;
    let id = item_id(&conn, &key)?;
    conn.execute("DELETE FROM itemTags WHERE itemId = ?1", [id]).map_err(|e| e.to_string())?;
    for t in tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [t])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO itemTags (itemId, tagId) SELECT ?1, id FROM tags WHERE name = ?2",
            rusqlite::params![id, t],
        )
        .map_err(|e| e.to_string())?;
    }
    touch(&conn, id);
    load_item(&conn, id)
}

#[tauri::command]
pub fn library_set_trashed(app: AppHandle, key: String, trashed: bool) -> Result<(), String> {
    let conn = open_db(&app)?;
    let id = item_id(&conn, &key)?;
    conn.execute(
        "UPDATE items SET trashed = ?1, dateModified = datetime('now') WHERE id = ?2",
        rusqlite::params![trashed as i64, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Permanent delete: rows (cascade) + the attachment folders on disk.
#[tauri::command]
pub fn library_delete_item(app: AppHandle, key: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    let id = item_id(&conn, &key)?;
    let mut st = conn
        .prepare("SELECT key FROM attachments WHERE itemId = ?1")
        .map_err(|e| e.to_string())?;
    let keys: Vec<String> = st
        .query_map([id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    drop(st);
    conn.execute("DELETE FROM items WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    let storage = library_dir(&app)?.join("storage");
    for k in keys {
        let _ = std::fs::remove_dir_all(storage.join(k));
    }
    Ok(())
}

#[tauri::command]
pub fn library_create_collection(
    app: AppHandle,
    name: String,
    parent_id: Option<i64>,
) -> Result<i64, String> {
    let conn = open_db(&app)?;
    conn.execute(
        "INSERT INTO collections (parentId, name) VALUES (?1, ?2)",
        rusqlite::params![parent_id, name.trim()],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn library_rename_collection(app: AppHandle, id: i64, name: String) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute(
        "UPDATE collections SET name = ?1 WHERE id = ?2",
        rusqlite::params![name.trim(), id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn library_delete_collection(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM collections WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Put an item in / take it out of a collection (Zotero's drag-to-collection).
#[tauri::command]
pub fn library_assign_collection(
    app: AppHandle,
    key: String,
    collection_id: i64,
    member: bool,
) -> Result<(), String> {
    let conn = open_db(&app)?;
    let id = item_id(&conn, &key)?;
    if member {
        conn.execute(
            "INSERT OR IGNORE INTO collectionItems (collectionId, itemId) VALUES (?1, ?2)",
            rusqlite::params![collection_id, id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "DELETE FROM collectionItems WHERE collectionId = ?1 AND itemId = ?2",
            rusqlite::params![collection_id, id],
        )
        .map_err(|e| e.to_string())?;
    }
    touch(&conn, id);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
    /// Workspace-relative path of the staged PDF ("raw/papers/….pdf").
    pub pdf_path: String,
    /// Workspace-relative path of the metadata sidecar ("raw/papers/….meta.json").
    pub meta_path: String,
}

/// Stage a library item for empirical-wiki ingestion: copy its first stored
/// PDF into the ACTIVE workspace's raw/papers/ next to a .meta.json sidecar
/// carrying the item's real metadata (so the ingest agent never re-guesses
/// title/authors/DOI from the PDF). Marks the item `wikiStaged` and returns
/// both workspace-relative paths for the session prompt.
#[tauri::command]
pub fn library_stage_for_wiki(app: AppHandle, key: String) -> Result<StageResult, String> {
    let conn = open_db(&app)?;
    stage_one(&conn, &app, &key)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageManyResult {
    pub staged: Vec<StageResult>,
    /// Titles that could not be staged (no stored PDF / missing file).
    pub skipped: Vec<String>,
}

/// Batch staging for a collection or the whole library — the "generate a wiki
/// for this sub-research" flow. Items without a stored PDF are reported, not
/// fatal: one bad item must not block the other thirty.
#[tauri::command]
pub fn library_stage_for_wiki_many(
    app: AppHandle,
    keys: Vec<String>,
) -> Result<StageManyResult, String> {
    let conn = open_db(&app)?;
    let mut staged = Vec::new();
    let mut skipped = Vec::new();
    for key in &keys {
        match stage_one(&conn, &app, key) {
            Ok(r) => staged.push(r),
            Err(_) => {
                let title = item_id(&conn, key)
                    .and_then(|id| load_item(&conn, id))
                    .map(|i| i.title)
                    .unwrap_or_else(|_| key.clone());
                skipped.push(title);
            }
        }
    }
    Ok(StageManyResult { staged, skipped })
}

fn stage_one(conn: &Connection, app: &AppHandle, key: &str) -> Result<StageResult, String> {
    let id = item_id(conn, key)?;
    let item = load_item(conn, id)?;
    let att = item
        .attachments
        .iter()
        .find(|a| a.content_type == "application/pdf" && a.rel_path.is_some())
        .ok_or("this item has no stored PDF attachment")?;
    let src = library_dir(app)?.join(att.rel_path.as_deref().unwrap_or_default());
    if !src.is_file() {
        return Err("attachment file is missing on disk".into());
    }

    // File stem from the title — readable in the workspace and in wiki logs.
    // Cap by CHARACTERS, not bytes: byte-truncate panics mid-codepoint on CJK
    // titles (String::truncate asserts a char boundary — crashed the app).
    let stem: String = safe_name(&item.title).chars().take(60).collect();
    let stem = stem.trim().trim_end_matches('.').to_string();
    let stem = if stem.is_empty() { item.key.clone() } else { stem };

    let ws = crate::runtime::workspace_dir(app)?;
    let dir = ws.join("raw").join("papers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::copy(&src, dir.join(format!("{stem}.pdf"))).map_err(|e| format!("copy failed: {e}"))?;

    let meta = serde_json::json!({
        "libraryKey": item.key,
        "itemType": item.item_type,
        "title": item.title,
        "creators": item.creators.iter().map(|c| serde_json::json!({
            "first": c.first, "last": c.last, "kind": c.kind,
        })).collect::<Vec<_>>(),
        "year": item.year,
        "tags": item.tags,
        "fields": item.fields,
    });
    std::fs::write(
        dir.join(format!("{stem}.meta.json")),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| e.to_string())?;

    // Remember where it went (v1 marks "sent for ingestion", not completion —
    // the agent has no write path back into the library yet).
    let ws_name = ws.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut fields = item.fields.clone();
    fields.insert("wikiStaged".into(), ws_name);
    conn.execute(
        "UPDATE items SET fields = ?1, dateModified = datetime('now') WHERE id = ?2",
        rusqlite::params![serde_json::to_string(&fields).unwrap_or_default(), id],
    )
    .map_err(|e| e.to_string())?;

    Ok(StageResult {
        pdf_path: format!("raw/papers/{stem}.pdf"),
        meta_path: format!("raw/papers/{stem}.meta.json"),
    })
}

// ---------------------------------------------------------------------------
// Annotations (highlights + notes) on library attachments
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: i64,
    pub attachment_key: String,
    pub page: i64,
    pub kind: String,
    pub color: String,
    /// JSON `[[x1,y1,x2,y2], …]` in PDF-page coordinates at scale 1
    /// (top-left origin, matching a pdf.js viewport) — the frontend multiplies
    /// by its render scale.
    pub rects: String,
    pub quoted: String,
    pub comment: String,
    pub date_added: String,
    pub date_modified: String,
}

fn load_annotation(conn: &Connection, id: i64) -> Result<Annotation, String> {
    conn.query_row(
        "SELECT id, attachmentKey, page, kind, color, rects, quoted, comment, dateAdded, dateModified
         FROM annotations WHERE id = ?1",
        [id],
        |r| {
            Ok(Annotation {
                id: r.get(0)?,
                attachment_key: r.get(1)?,
                page: r.get(2)?,
                kind: r.get(3)?,
                color: r.get(4)?,
                rects: r.get(5)?,
                quoted: r.get(6)?,
                comment: r.get(7)?,
                date_added: r.get(8)?,
                date_modified: r.get(9)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn annotation_list(app: AppHandle, attachment_key: String) -> Result<Vec<Annotation>, String> {
    let conn = open_db(&app)?;
    let mut st = conn
        .prepare("SELECT id FROM annotations WHERE attachmentKey = ?1 ORDER BY page, id")
        .map_err(|e| e.to_string())?;
    let ids: Vec<i64> = st
        .query_map([&attachment_key], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    drop(st);
    ids.into_iter().map(|id| load_annotation(&conn, id)).collect()
}

#[tauri::command]
pub fn annotation_add(
    app: AppHandle,
    attachment_key: String,
    page: i64,
    color: String,
    rects: String,
    quoted: String,
) -> Result<Annotation, String> {
    // rects must be a JSON array of 4-number arrays — reject garbage early.
    let parsed: Vec<[f64; 4]> =
        serde_json::from_str(&rects).map_err(|e| format!("bad rects: {e}"))?;
    if parsed.is_empty() {
        return Err("empty rects".into());
    }
    let conn = open_db(&app)?;
    conn.execute(
        "INSERT INTO annotations (attachmentKey, page, color, rects, quoted) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![attachment_key, page, color, rects, quoted],
    )
    .map_err(|e| e.to_string())?;
    load_annotation(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn annotation_update(
    app: AppHandle,
    id: i64,
    color: Option<String>,
    comment: Option<String>,
) -> Result<Annotation, String> {
    let conn = open_db(&app)?;
    if let Some(c) = color {
        conn.execute(
            "UPDATE annotations SET color = ?1, dateModified = datetime('now') WHERE id = ?2",
            rusqlite::params![c, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(c) = comment {
        conn.execute(
            "UPDATE annotations SET comment = ?1, dateModified = datetime('now') WHERE id = ?2",
            rusqlite::params![c, id],
        )
        .map_err(|e| e.to_string())?;
    }
    load_annotation(&conn, id)
}

#[tauri::command]
pub fn annotation_delete(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = open_db(&app)?;
    conn.execute("DELETE FROM annotations WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub skipped: usize,
}

/// One-shot import of the local Zotero library (items + collections + stored
/// PDFs). Item/attachment/collection identity is keyed on Zotero's own keys
/// (stored in the fields map as `zoteroKey`), so re-running only picks up
/// what's new.
#[tauri::command]
pub fn library_import_zotero(app: AppHandle) -> Result<ImportResult, String> {
    let zot = crate::zotero::zotero_library(app.clone())?;
    let zot_dir = PathBuf::from(&zot.data_dir);
    let conn = open_db(&app)?;

    // Collections: map Zotero collection ids -> ours, matching by name+parent.
    let mut coll_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    // Parents before children so parent ids are always resolvable.
    let mut pending: Vec<&ZoteroCollection> = zot.collections.iter().collect();
    let mut guard = 0;
    while !pending.is_empty() && guard < 100 {
        guard += 1;
        pending.retain(|c| {
            let parent = match c.parent_id {
                None => None,
                Some(zp) => match coll_map.get(&zp) {
                    Some(p) => Some(*p),
                    None => return true, // parent not mapped yet — next round
                },
            };
            let existing = match parent {
                Some(p) => conn.query_row(
                    "SELECT id FROM collections WHERE name = ?1 AND parentId = ?2",
                    rusqlite::params![c.name, p],
                    |r| r.get::<_, i64>(0),
                ),
                None => conn.query_row(
                    "SELECT id FROM collections WHERE name = ?1 AND parentId IS NULL",
                    rusqlite::params![c.name],
                    |r| r.get::<_, i64>(0),
                ),
            };
            let id = existing.unwrap_or_else(|_| {
                let _ = conn.execute(
                    "INSERT INTO collections (parentId, name) VALUES (?1, ?2)",
                    rusqlite::params![parent, c.name],
                );
                conn.last_insert_rowid()
            });
            coll_map.insert(c.id, id);
            false
        });
    }

    let mut imported = 0;
    let mut skipped = 0;
    for item in &zot.items {
        let exists: Result<i64, _> = conn.query_row(
            "SELECT id FROM items WHERE fields LIKE ?1",
            [format!("%\"zoteroKey\":\"{}\"%", item.key)],
            |r| r.get(0),
        );
        if exists.is_ok() {
            skipped += 1;
            continue;
        }
        let mut fields = item.fields.clone();
        fields.insert("title".into(), item.title.clone());
        fields.insert("zoteroKey".into(), item.key.clone());
        let id = insert_item(&conn, &item.item_type, &fields, &item.creators)?;
        if !item.tags.is_empty() {
            for t in &item.tags {
                let _ = conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [t]);
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO itemTags (itemId, tagId) SELECT ?1, id FROM tags WHERE name = ?2",
                    rusqlite::params![id, t],
                );
            }
        }
        for zc in &item.collection_ids {
            if let Some(c) = coll_map.get(zc) {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO collectionItems (collectionId, itemId) VALUES (?1, ?2)",
                    rusqlite::params![c, id],
                );
            }
        }
        for att in &item.attachments {
            if let Some(rel) = &att.rel_path {
                let src = zot_dir.join(rel);
                if src.is_file() {
                    let _ = attach_file(&conn, &app, id, &src, &att.content_type);
                }
            }
        }
        imported += 1;
    }
    Ok(ImportResult { imported, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doi_detection_trims_prose_punctuation() {
        assert_eq!(
            doi_in("as shown (doi: 10.1080/10410236.2018.1493416)."),
            Some("10.1080/10410236.2018.1493416".to_string())
        );
        assert_eq!(doi_in("no identifiers here"), None);
    }

    #[test]
    fn arxiv_detection_from_text_and_filename() {
        assert_eq!(arxiv_in("preprint arXiv:2304.10548v2 [cs.CL]"), Some("2304.10548".into()));
        assert_eq!(arxiv_in_name("2304.10548.pdf"), Some("2304.10548".into()));
        assert_eq!(arxiv_in_name("my paper final.pdf"), None);
    }

    #[test]
    fn year_extraction_handles_multipart_dates() {
        assert_eq!(first_year("2023-05-01"), Some(2023));
        assert_eq!(first_year("May 12, 1998"), Some(1998));
        assert_eq!(first_year("n.d."), None);
    }

    #[test]
    fn cjk_title_stem_never_splits_a_codepoint() {
        // Regression: stem.truncate(80) panicked mid-codepoint on a Chinese
        // title when byte 80 fell inside a 3-byte CJK char.
        let title = "耐心资本、动态能力与企业绿色转型：来自中国上市公司的经验证据与机制分析研究".repeat(3);
        let stem: String = safe_name(&title).chars().take(60).collect();
        assert!(stem.chars().count() <= 60);
        assert!(stem.is_char_boundary(stem.len()));
    }

    #[test]
    fn split_catalog_groups_items_by_project_and_copies_storage() {
        let base = std::env::temp_dir().join(format!("split-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let cat = base.join("Literature").join("catalog");
        std::fs::create_dir_all(cat.join("storage").join("ATT1")).unwrap();
        std::fs::write(cat.join("storage").join("ATT1").join("paper.pdf"), b"%PDF-1").unwrap();
        // Build a source catalog: 2 items, one filed under collection "耐心资本",
        // one uncollected (→ 全库). The filed one has a stored PDF attachment.
        {
            let c = Connection::open(cat.join("library.sqlite")).unwrap();
            init_schema(&c).unwrap();
            c.execute("INSERT INTO items(key,itemType,fields) VALUES('K1','journalArticle','{\"title\":\"A\"}')", []).unwrap();
            c.execute("INSERT INTO items(key,itemType,fields) VALUES('K2','journalArticle','{\"title\":\"B\"}')", []).unwrap();
            c.execute("INSERT INTO creators(itemId,orderIndex,firstName,lastName,kind) VALUES(1,0,'X','Qiu','author')", []).unwrap();
            c.execute("INSERT INTO attachments(itemId,key,title,contentType,fileName) VALUES(1,'ATT1','pdf','application/pdf','paper.pdf')", []).unwrap();
            c.execute("INSERT INTO annotations(attachmentKey,page,rects) VALUES('ATT1',1,'[]')", []).unwrap();
            c.execute("INSERT INTO collections(name) VALUES('耐心资本')", []).unwrap();
            c.execute("INSERT INTO collectionItems(collectionId,itemId) VALUES(1,1)", []).unwrap();
        }

        let report = split_catalog_to_projects(&base).unwrap();
        let by: std::collections::HashMap<_, _> = report.projects.iter().cloned().collect();
        assert_eq!(by.get("耐心资本"), Some(&1));
        assert_eq!(by.get("全库"), Some(&1));
        assert_eq!(report.attachments_copied, 1);

        // The filed project's own db has item K1 with its creator + attachment,
        // and the PDF was copied into that project's storage.
        let proj = base.join("耐心资本").join("literature");
        assert!(proj.join("storage").join("ATT1").join("paper.pdf").is_file());
        let c = Connection::open(proj.join("library.sqlite")).unwrap();
        let n: i64 = c.query_row("SELECT COUNT(*) FROM items WHERE key='K1'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        let cr: i64 = c.query_row("SELECT COUNT(*) FROM creators", [], |r| r.get(0)).unwrap();
        assert_eq!(cr, 1);

        // The catalog is retired, so a second run is a clean no-op.
        assert!(base.join("Literature").join("catalog.pre-projects-bak").is_dir());
        assert!(split_catalog_to_projects(&base).unwrap().projects.is_empty());

        let _ = std::fs::remove_dir_all(&base);
    }

    /// Dry-run the split against a COPY of the real ~/Fishes/Literature library,
    /// so we can see it produce correct per-project libraries before wiring it
    /// into startup. Run: `cargo test --ignored real_library_split -- --nocapture`.
    #[test]
    #[ignore]
    fn real_library_split_dry_run() {
        let home = std::env::var("HOME").unwrap();
        let real = PathBuf::from(&home).join("Fishes").join("Literature");
        if !real.join("catalog").join("library.sqlite").is_file() {
            eprintln!("no real catalog at {real:?}; skipping");
            return;
        }
        let base = std::env::temp_dir().join("fishes-split-dryrun");
        let _ = std::fs::remove_dir_all(&base);
        copy_dir(&real, &base.join("Literature")).unwrap();
        let report = split_catalog_to_projects(&base).unwrap();
        eprintln!("SPLIT REPORT: {report:?}");
        for (name, n) in &report.projects {
            let db = base.join(name).join("literature").join("library.sqlite");
            let c = Connection::open(&db).unwrap();
            let items: i64 = c.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0)).unwrap();
            let atts: i64 = c.query_row("SELECT COUNT(*) FROM attachments", [], |r| r.get(0)).unwrap();
            eprintln!("  project '{name}': report={n} db_items={items} db_attachments={atts}");
            assert_eq!(*n as i64, items);
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn item_crud_roundtrip_in_memory() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        let mut fields = BTreeMap::new();
        fields.insert("title".to_string(), "A Study".to_string());
        fields.insert("date".to_string(), "2021-02-03".to_string());
        let creators = vec![ZoteroCreator {
            first: "Ada".into(),
            last: "Lovelace".into(),
            kind: "author".into(),
        }];
        let id = insert_item(&conn, "journalArticle", &fields, &creators).unwrap();
        let item = load_item(&conn, id).unwrap();
        assert_eq!(item.title, "A Study");
        assert_eq!(item.year, Some(2021));
        assert_eq!(item.creators.len(), 1);
        assert_eq!(item.creators[0].last, "Lovelace");
        assert!(!item.trashed);
    }

    /// Real-PDF check: point LIB_TEST_PDF at any digital paper PDF and this
    /// verifies text extraction finds a DOI or arXiv id in its head. Ignored
    /// by default: `LIB_TEST_PDF=… cargo test pdf_yields -- --ignored`.
    #[test]
    #[ignore]
    fn pdf_yields_an_identifier() {
        let path = std::env::var("LIB_TEST_PDF").expect("set LIB_TEST_PDF");
        let text = pdf_extract::extract_text(&path).expect("extract");
        let head: String = text.chars().take(20_000).collect();
        let id = doi_in(&head).or_else(|| arxiv_in(&head));
        println!("identifier: {id:?}");
        assert!(id.is_some());
    }

    /// Live-path check: real PDF -> text -> DOI -> doi.org CSL-JSON. Needs
    /// network + a local test PDF, so it's ignored by default; run explicitly
    /// with `cargo test doi_org -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn doi_org_resolves_an_arxiv_doi() {
        let meta =
            tauri::async_runtime::block_on(fetch_csl("10.48550/arXiv.2304.10548")).unwrap();
        assert!(meta.fields.get("title").is_some(), "title missing: {:?}", meta.fields);
        assert!(!meta.creators.is_empty());
    }
}
