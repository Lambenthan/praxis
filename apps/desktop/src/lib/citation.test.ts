import { describe, expect, it } from "vitest";
import { formatBibliography } from "./citation";
import type { LibItem } from "./library";

function item(over: Partial<LibItem>): LibItem {
  return {
    key: "K",
    itemType: "journalArticle",
    title: "",
    creators: [],
    year: null,
    tags: [],
    fields: {},
    collectionIds: [],
    attachments: [],
    dateAdded: "2026-01-01 00:00:00",
    dateModified: "2026-01-01 00:00:00",
    trashed: false,
    ...over,
  };
}

const author = (first: string, last: string) => ({ first, last, kind: "author" });

/** A Chinese journal article with 4 authors (3+ triggers 等 in GB/T). */
const zhArticle = item({
  key: "ZH1",
  title: "数字化转型与企业创新绩效",
  creators: [
    author("伟", "张"),
    author("静", "李"),
    author("芳", "王"),
    author("强", "陈"),
  ],
  year: 2021,
  fields: {
    publicationTitle: "管理世界",
    volume: "37",
    issue: "5",
    pages: "87-105",
    language: "zh-CN",
  },
});

/** A Western journal article with a DOI. */
const enArticle = item({
  key: "EN1",
  title: "Using thematic analysis in psychology",
  creators: [author("Virginia", "Braun"), author("Victoria", "Clarke")],
  year: 2006,
  fields: {
    publicationTitle: "Qualitative Research in Psychology",
    volume: "3",
    issue: "2",
    pages: "77-101",
    DOI: "10.1191/1478088706qp063oa",
  },
});

describe("formatBibliography — APA 6th", () => {
  it("formats a Western journal article with DOI", () => {
    expect(formatBibliography([enArticle], "apa")).toEqual([
      "Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. " +
        "Qualitative Research in Psychology, 3(2), 77–101. " +
        "https://doi.org/10.1191/1478088706qp063oa",
    ]);
  });

  it("formats a Chinese journal article (family+given, no comma, no initials)", () => {
    expect(formatBibliography([zhArticle], "apa")).toEqual([
      "张伟, 李静, 王芳, & 陈强 (2021). 数字化转型与企业创新绩效. 管理世界, 37(5), 87–105.",
    ]);
  });

  it("sorts alphabetically by first author regardless of input order", () => {
    const zim = item({
      key: "Z",
      title: "Later alphabet",
      creators: [author("Anna", "Zimmer")],
      year: 2010,
      fields: { publicationTitle: "Journal A" },
    });
    const out = formatBibliography([zim, enArticle], "apa");
    expect(out[0].startsWith("Braun")).toBe(true);
    expect(out[1].startsWith("Zimmer")).toBe(true);
  });

  it("formats a thesis with the (Doctoral dissertation) tag and school", () => {
    const th = item({
      itemType: "thesis",
      title: "Essays on platform work",
      creators: [author("Jane", "Doe")],
      year: 2019,
      fields: { university: "MIT" },
    });
    expect(formatBibliography([th], "apa")).toEqual([
      "Doe, J. (2019). Essays on platform work (Doctoral dissertation). MIT.",
    ]);
  });
});

describe("formatBibliography — GB/T 7714 (顺序编码制)", () => {
  it("formats a Chinese journal article: up to 3 authors then 等, [J], 刊名, 年, 卷(期): 页码", () => {
    expect(formatBibliography([zhArticle], "gbt7714")).toEqual([
      "[1] 张伟, 李静, 王芳, 等. 数字化转型与企业创新绩效[J]. 管理世界, 2021, 37(5): 87-105.",
    ]);
  });

  it("formats a Western journal article: FAMILY-caps initials, no DOI", () => {
    expect(formatBibliography([enArticle], "gbt7714")).toEqual([
      "[1] BRAUN V, CLARKE V. Using thematic analysis in psychology[J]. " +
        "Qualitative Research in Psychology, 2006, 3(2): 77-101.",
    ]);
  });

  it("numbers entries in input order (no re-sorting)", () => {
    const out = formatBibliography([enArticle, zhArticle], "gbt7714");
    expect(out[0].startsWith("[1] BRAUN")).toBe(true);
    expect(out[1].startsWith("[2] 张伟")).toBe(true);
  });

  it("uses [M] for books and [D] for theses", () => {
    const book = item({
      itemType: "book",
      title: "扎根理论研究方法",
      creators: [author("三", "张")],
      year: 2018,
      fields: { place: "北京", publisher: "社会科学文献出版社" },
    });
    const th = item({
      itemType: "thesis",
      title: "业审融合下的内部审计转型研究",
      creators: [author("四", "李")],
      year: 2023,
      fields: { place: "南京", university: "南京审计大学" },
    });
    expect(formatBibliography([book, th], "gbt7714")).toEqual([
      "[1] 张三. 扎根理论研究方法[M]. 北京: 社会科学文献出版社, 2018.",
      "[2] 李四. 业审融合下的内部审计转型研究[D]. 南京: 南京审计大学, 2023.",
    ]);
  });

  it("collapses to 年(期) when there is no volume", () => {
    const noVol = item({
      title: "无卷号的文章",
      creators: [author("五", "王")],
      year: 2020,
      fields: { publicationTitle: "社会学研究", issue: "4", pages: "1-20" },
    });
    expect(formatBibliography([noVol], "gbt7714")).toEqual([
      "[1] 王五. 无卷号的文章[J]. 社会学研究, 2020(4): 1-20.",
    ]);
  });
});
