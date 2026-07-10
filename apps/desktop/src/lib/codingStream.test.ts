import { describe, expect, it } from "vitest";
import { splitCodingSteps } from "./codingStream";

const block = (obj: Record<string, unknown>) => "```coding\n" + JSON.stringify(obj) + "\n```";

describe("splitCodingSteps", () => {
  it("extracts every coding block in order and strips them from the prose", () => {
    const text =
      "开放编码中：\n" +
      block({ quote: "坐班那套让我觉得自己在演戏", code: "表演性", memo: "把例行公事体验为被迫表演" }) +
      "\n继续下一段。\n" +
      block({ quote: "没人盯着我，我对自己反而更狠", code: "自我驱动" });
    const { clean, steps } = splitCodingSteps(text);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({
      kind: "coding-step",
      quote: "坐班那套让我觉得自己在演戏",
      code: "表演性",
      memo: "把例行公事体验为被迫表演",
      source: undefined,
    });
    expect(steps[1].code).toBe("自我驱动");
    expect(steps[1].memo).toBeUndefined();
    // fences removed from the surviving prose
    expect(clean).not.toContain("```coding");
    expect(clean).toContain("开放编码中");
    expect(clean).toContain("继续下一段");
  });

  it("skips a malformed block but keeps the valid ones", () => {
    const text = "```coding\n{ not json\n```\n" + block({ quote: "收入不稳定", code: "收入不稳定" });
    const { steps } = splitCodingSteps(text);
    expect(steps).toHaveLength(1);
    expect(steps[0].code).toBe("收入不稳定");
  });

  it("ignores a block missing quote or code (needs both)", () => {
    const text = block({ code: "无引文" }) + "\n" + block({ quote: "无码" });
    expect(splitCodingSteps(text).steps).toHaveLength(0);
  });

  it("returns the text untouched when there are no coding blocks", () => {
    const { clean, steps } = splitCodingSteps("just a normal reply");
    expect(steps).toHaveLength(0);
    expect(clean).toBe("just a normal reply");
  });
});
