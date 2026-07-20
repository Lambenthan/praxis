// One feedback path for a non-technical audience: a prefilled GitHub issue
// carrying the safe diagnostics (version, OS, model id — never keys or data),
// so "it broke" reports arrive actionable. Falls back to a plain URL when the
// version lookup fails.
import { isTauri, openExternal } from "@/lib/tauri";
import { useRuntimeStore } from "@/lib/runtime";

const REPO = "https://github.com/Lambenthan/fishes";

export async function openFeedback(): Promise<void> {
  let version = "unknown";
  try {
    if (isTauri) {
      const { getVersion } = await import("@tauri-apps/api/app");
      version = await getVersion();
    }
  } catch {
    /* keep "unknown" */
  }
  const model = useRuntimeStore.getState().defaultModel ?? "未设置";
  const platform = navigator.platform || "unknown";
  const body = [
    "**问题描述**(哪一步卡住了?看到什么?期望什么?)",
    "",
    "",
    "**截图**(强烈建议 — 直接粘贴到这里)",
    "",
    "",
    "---",
    "诊断信息(自动填写,不含任何密钥或数据):",
    `- Fishes 版本: ${version}`,
    `- 系统: ${platform}`,
    `- 模型: ${model}`,
  ].join("\n");
  const url = `${REPO}/issues/new?title=${encodeURIComponent("[反馈] ")}&body=${encodeURIComponent(body)}`;
  await openExternal(url);
}
