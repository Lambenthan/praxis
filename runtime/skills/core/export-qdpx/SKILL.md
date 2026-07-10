---
name: export-qdpx
description: >-
  把一个 .qcode 编码文件导出为 REFI-QDA 交换包(.qdpx),供 NVivo / MAXQDA / ATLAS.ti
  导入。当用户说"导出 qdpx""导出到 NVivo""给 MAXQDA 用""导出 REFI-QDA""export qdpx"
  时使用。
---

# .qcode → .qdpx(REFI-QDA 交换包)

把裁决完的 `.qcode` 转成标准 REFI-QDA 项目包,NVivo 14+/MAXQDA/ATLAS.ti 均可导入。

## 三条铁律(违反即失败)

1. **`.qdpx` 必须用 Python 脚本生成**(zip 打包 + XML 序列化),绝不手写 XML、绝不手算坐标。
2. **默认只导出已采纳的标注**(`status == "adopted"`,含未写 status 的旧数据)。
   若一条已采纳的都没有,不要静默导出候选——告诉用户"还没有已采纳的标注,请先在裁决台采纳,
   或明确说'连候选一起导'再导全部"。
3. **源文本一字不改**写入包内,坐标沿用 `.qcode` 里的 start/end,不重新定位。

## 脚本(照抄结构,替换文件名)

```python
import json, uuid, zipfile
from xml.sax.saxutils import escape, quoteattr

QCODE = "open_coding.qcode"          # 输入
QDPX  = "open_coding.qdpx"           # 输出
doc = json.load(open(QCODE, encoding="utf-8"))
g = lambda: str(uuid.uuid4()).upper()

keep = [a for a in doc["annotations"] if a.get("status", "adopted") == "adopted"]
assert keep, "no adopted annotations — adjudicate first"

PALETTE = ["#2A78D6", "#1BAF7A", "#EDA100", "#008300", "#4A3AA7", "#E34948", "#E87BA4", "#EB6834"]
code_guid = {c["name"]: g() for c in doc["codes"]}
codes_xml = "".join(
    f'<Code guid="{code_guid[c["name"]]}" name={quoteattr(c["name"])} isCodable="true" '
    f'color="{PALETTE[i % 8]}">'
    + (f'<Description>{escape(c["description"])}</Description>' if c.get("description") else "")
    + "</Code>"
    for i, c in enumerate(doc["codes"])
)

src_guid = {s["id"]: g() for s in doc["sources"]}
sources_xml = ""
for s in doc["sources"]:
    sg = src_guid[s["id"]]
    sels = "".join(
        f'<PlainTextSelection guid="{g()}" startPosition="{a["start"]}" endPosition="{a["end"]}">'
        f'<Coding guid="{g()}"><CodeRef targetGUID="{code_guid[a["code"]]}"/></Coding>'
        f"</PlainTextSelection>"
        for a in keep if a["source"] == s["id"]
    )
    sources_xml += (
        f'<TextSource guid="{sg}" name={quoteattr(s.get("title") or s["id"])} '
        f'plainTextPath="internal://{sg}.txt">{sels}</TextSource>'
    )

xml = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<Project xmlns="urn:QDA-XML:project:1.0" name="open_coding" origin="Praxis">'
    f"<CodeBook><Codes>{codes_xml}</Codes></CodeBook>"
    f"<Sources>{sources_xml}</Sources>"
    "</Project>"
)

with zipfile.ZipFile(QDPX, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("project.qde", xml)
    for s in doc["sources"]:
        z.writestr(f"sources/{src_guid[s['id']]}.txt", s["text"])
print(f"{QDPX}: {len(doc['codes'])} codes, {len(keep)} codings")
```

要点:包结构 = 根下 `project.qde` + `sources/<GUID>.txt`;命名空间必须是
`urn:QDA-XML:project:1.0`;`CodeBook` 在 `Sources` 之前;GUID 全大写;
`plainTextPath="internal://<GUID>.txt"` 指向 sources 目录里的同名文件。

## 已知限制(如实告知用户)

- 标注的 memo 不进 qdpx(REFI-QDA 里 memo 是独立 Note 对象,v1 不做);码的 description 会带上。
- 各 QDA 软件对换行/坐标的处理略有出入,导入 NVivo 后建议抽查两条高亮位置。

## 完成

只对用户说一句话,例如:
"已导出 `open_coding.qdpx`(N 个码、M 条已采纳标注),NVivo → Import → REFI-QDA Project 即可导入。"
