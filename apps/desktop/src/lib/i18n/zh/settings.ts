/** zh strings for the Settings two-pane surface (nav, About, Permissions,
 *  licenses). Keys are the English source strings; anything missing falls back
 *  to English automatically. */
export const settingsZh: Record<string, string> = {
  // Nav groups + sections
  Workspace: "工作区",
  Capabilities: "能力",
  General: "通用",
  Data: "数据",
  About: "关于",
  Connectors: "连接器",
  Permissions: "权限",

  // General
  "Appearance and app-wide preferences.": "外观与应用级偏好。",
  Theme: "主题",
  "Match the app to your preferred light or dark appearance.": "让应用匹配你偏好的浅色或深色外观。",

  // Model
  "Default model": "默认模型",
  "The model new sessions use. Providers below supply the choices.":
    "新会话使用的模型。下方的提供方提供可选项。",

  // Data
  "Workspace folder": "工作区文件夹",
  "The base folder new sessions are created under.": "新会话创建时所在的根文件夹。",

  // Language
  "The language Fishes's own interface is shown in.": "Fishes 界面本身显示的语言。",
  "Interface language": "界面语言",
  "Applies to Fishes's menus and labels, not your chats.": "作用于 Fishes 的菜单和标签，不影响你的对话。",

  // About
  "Fishes — an AI workbench for social-science research.": "Fishes——面向社会科学研究的 AI 工作台。",
  Version: "版本",
  "Check whether a newer version is available.": "检查是否有更新版本。",
  "Checking for updates…": "正在检查更新……",
  "Checking…": "检查中……",
  "Check for updates": "检查更新",
  "You're up to date.": "已是最新版本。",
  "A new version is ready to install.": "有新版本可安装。",
  "Updates are available in the desktop app.": "更新功能在桌面应用中可用。",
  "Could not check for updates. Check your connection and try again.":
    "无法检查更新。请检查网络连接后重试。",
  "Update available:": "有可用更新：",
  "Applying…": "应用中……",
  "Restart to update": "重启以更新",
  "The update could not be installed. Check your connection and try again.":
    "更新未能安装。请检查网络连接后重试。",
  "Third-Party Licenses": "第三方许可",
  "Open-source components bundled with Fishes and their licenses.":
    "随 Fishes 一同分发的开源组件及其许可证。",
  View: "查看",
  "Fishes is MIT-licensed (forked from the open-science base). It bundles these open-source components; each package ships its full license text.":
    "Fishes 采用 MIT 许可（fork 自 open-science 基座），内置以下开源组件；每个包都附带完整许可证文本。",
  Close: "关闭",

  // Permissions
  "How agent actions get approved in this workspace.": "在此工作区中，智能体的操作如何获得批准。",
  "Approval mode applies in the desktop app.": "审批模式在桌面应用中生效。",
  "Approval mode": "审批模式",
  "The agent may only touch the current workspace. This decides whether risky actions pause for your OK.":
    "智能体只能访问当前工作区。此项决定高风险操作是否暂停以等待你的确认。",
  "Manual approval": "手动审批",
  "The agent asks before running commands, deleting files, installing dependencies, or connecting out. Recommended.":
    "智能体在运行命令、删除文件、安装依赖或对外连接前会先询问。推荐。",
  "Full access": "完全访问",
  "The agent acts without asking. Faster, but it can run commands and change files on its own — only for a trusted workspace.":
    "智能体无需询问即可操作。更快，但它可以自行运行命令、改动文件——仅用于可信工作区。",
  "Full access enabled — the agent will act without asking.": "已启用完全访问——智能体将无需询问直接操作。",
  "Manual approval enabled — the agent will ask before acting.": "已启用手动审批——智能体操作前会先询问。",
  "Could not change the approval mode:": "无法更改审批模式：",
  // Model section — reasoning effort + subagent model
  "Reasoning effort": "推理强度",
  "How hard a reasoning model thinks before answering. Ignored by models without a reasoning mode. Takes effect on new turns.":
    "推理型模型在作答前思考的深度。不具备推理模式的模型会忽略此项。对新的对话轮次生效。",
  "Subagent model": "子智能体模型",
  "The model dispatched worker subagents use. Leave unset to inherit the main model.":
    "派发的工作子智能体所使用的模型。留空则沿用主模型。",
  "Could not set the reasoning effort": "无法设置推理强度",
  "Reasoning effort set to": "推理强度已设为",
  "Could not set the subagent model": "无法设置子智能体模型",
  "Subagent model set to": "子智能体模型已设为",
  minimal: "最低",
  low: "低",
  medium: "中",
  high: "高",
  "Text size": "文字大小",
  "Scale the whole interface. Shortcuts: ⌘+ / ⌘− / ⌘0 (Ctrl on Windows), just like a browser.":
    "缩放整个界面。快捷键 ⌘+ / ⌘− / ⌘0（Windows 用 Ctrl），跟浏览器一样。",
  Reset: "复位",
};
