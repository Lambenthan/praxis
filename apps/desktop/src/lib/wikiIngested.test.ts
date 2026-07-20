import { describe, expect, it } from "vitest";
import { extractFrontmatterTitle, isIngested, normalizeTitle } from "./wikiIngested";

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation, keeping CJK and digits", () => {
    expect(normalizeTitle("Patient Capital & Firm TFP!")).toBe("patientcapitalfirmtfp");
    expect(normalizeTitle("耐心资本与企业全要素生产率提升_邱蓉")).toBe(
      "耐心资本与企业全要素生产率提升邱蓉",
    );
    expect(normalizeTitle("A—B：C（2024）")).toBe("abc2024");
  });

  it("treats underscore, dash and space variants as one title", () => {
    expect(normalizeTitle("耐心资本_邱蓉")).toBe(normalizeTitle("耐心资本-邱蓉"));
    expect(normalizeTitle("patient capital")).toBe(normalizeTitle("Patient-Capital"));
  });
});

describe("extractFrontmatterTitle", () => {
  it("reads a double-quoted title from the frontmatter block", () => {
    const md = '---\ntitle: "耐心资本与企业全要素生产率提升"\nslug: "x"\nyear: 2025\n---\n\n# body';
    expect(extractFrontmatterTitle(md)).toBe("耐心资本与企业全要素生产率提升");
  });

  it("reads unquoted and single-quoted titles", () => {
    expect(extractFrontmatterTitle("---\ntitle: Plain Title\n---\n")).toBe("Plain Title");
    expect(extractFrontmatterTitle("---\ntitle: 'Quoted'\n---\n")).toBe("Quoted");
  });

  it("returns null without frontmatter or without a title line", () => {
    expect(extractFrontmatterTitle("# just a doc\ntitle: nope")).toBeNull();
    expect(extractFrontmatterTitle("---\nyear: 2025\n---\n")).toBeNull();
  });

  it("ignores a title-looking line outside the frontmatter", () => {
    expect(extractFrontmatterTitle('---\nyear: 2025\n---\ntitle: "later"')).toBeNull();
  });
});

describe("isIngested", () => {
  const wiki = new Set(
    [
      "耐心资本与企业全要素生产率提升", // clean frontmatter title
      "专精特新转型与企业新质生产力发展——基于风险投资和耐心资本的证据", // title with subtitle
      "专精特新转型与企业新质生产力发展-简冠群", // filename slug with author suffix
      "Patient Capital and Corporate Innovation",
    ].map(normalizeTitle),
  );

  it("matches an exact CJK title", () => {
    expect(isIngested("耐心资本与企业全要素生产率提升", wiki)).toBe(true);
  });

  it("matches a library title carrying an _作者 suffix (prefix rule)", () => {
    expect(isIngested("耐心资本与企业全要素生产率提升_邱蓉", wiki)).toBe(true);
  });

  it("matches when the wiki slug carries the author suffix", () => {
    expect(isIngested("专精特新转型与企业新质生产力发展_简冠群", wiki)).toBe(true);
  });

  it("matches a main title against the wiki's full title——subtitle (prefix rule)", () => {
    expect(isIngested("专精特新转型与企业新质生产力发展", wiki)).toBe(true);
  });

  it("matches across punctuation and case variants", () => {
    expect(isIngested("patient capital and corporate innovation!", wiki)).toBe(true);
    expect(isIngested("PATIENT-CAPITAL AND CORPORATE INNOVATION", wiki)).toBe(true);
  });

  it("does not match an unrelated paper", () => {
    expect(isIngested("管理者短视主义影响企业长期投资吗", wiki)).toBe(false);
  });

  it("ignores prefix matches shorter than the guard length", () => {
    // "耐心资本" is a prefix of an ingested title, but far too short to claim it.
    expect(isIngested("耐心资本", wiki)).toBe(false);
    expect(isIngested("", wiki)).toBe(false);
  });
});
