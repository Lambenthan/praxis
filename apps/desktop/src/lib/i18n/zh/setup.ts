/** Setup guide (first-run). Keys are the English source strings.
 *  Tone: plain product copy — short, factual, no metaphors, no chattiness. */
export const setupZh: Record<string, string> = {
  Setup: "安装向导",
  "Get started": "开始使用",
  "Connect a model to start. Stata and the demo are optional — you can come back here any time.":
    "连接一个模型即可开始使用。Stata 与演示为可选项，之后随时可以回到本页配置。",
  "Setting up Fishes — the first launch takes about 2 minutes. This page updates automatically when it's ready.":
    "正在配置 Fishes——首次启动预计需要 2 分钟，就绪后本页会自动更新。",

  // Step 1 · model
  "Connect a model (required)": "连接一个模型（必选）",
  "Analysis runs on an AI model. Pick a provider, create an API key on its site, and paste it here.":
    "分析由 AI 模型完成。选择一家服务商，在其官网申请 API key，粘贴到下方。",
  "cheap, steady, reachable from mainland China": "价格低，国内可直连",
  "one key that unlocks many models": "一个 key 可使用多家模型",
  "Get a key from": "获取 API key：",
  "Testing the connection…": "正在测试连接…",
  "Key verified — setting up Fishes (about 2 minutes), it saves automatically…":
    "key 已验证——正在配置 Fishes（预计 2 分钟），完成后自动保存…",
  "connected — the model is ready.": "已连接。",
  "Or point Fishes at your own endpoint — a local Ollama or any OpenAI/Anthropic-compatible service.":
    "也可以接入你自己的端点——本地 Ollama，或任何 OpenAI/Anthropic 兼容服务。",
  "Waiting for the workbench to finish starting — the endpoint saves automatically…":
    "正在等待应用完成启动，端点会自动保存…",
  "Could not save the key": "保存失败",
  "The workbench is still starting up — wait a moment and try again.":
    "应用正在启动，请稍候再试。",
  "Connect a model first": "请先连接模型",

  // Step 2 · Stata
  "Connect Stata (optional)": "连接 Stata（可选）",
  "Connect Stata": "连接 Stata",
  "One click installs the Stata bridge into an isolated environment — nothing on your system is touched. Needs a licensed Stata already installed on this computer.":
    "将 Stata 桥接安装到应用自带的独立环境中，不改动系统。需要本机已安装 Stata。",
  "The quick scan didn't spot Stata — it can miss custom installs. If Stata is on this machine, Connect Stata searches deeper; otherwise skip, R and Python analyses work without it.":
    "快速扫描没有发现 Stata——重命名的目录、非常规盘符可能漏判。如果本机装了 Stata，直接点「连接 Stata」会做更彻底的查找；没装则可跳过，R 和 Python 分析不受影响。",
  "Choose the Stata program manually…": "手动选择 Stata 程序…",
  "Installed Stata but it wasn't found? Choose the Stata program manually…":
    "已装 Stata 却没被找到？手动选择 Stata 程序…",
  "Stata is connected — the agent can run do-files.": "Stata 已连接，可以运行 do 文件。",
  "Setting up…": "正在配置…",
  "Registering the connector…": "正在注册连接器…",

  // Step 3 · demo
  "Run the demo (optional)": "运行演示（可选）",
  "Open a project to work in": "打开一个项目开始工作",
  "Fishes works like a code editor: you open ONE project folder, and everything for that study — its literature, data, notebooks, and conversations — lives inside it, kept apart from your other projects.":
    "Fishes 像代码编辑器一样：你打开一个项目文件夹，这项研究的一切——文献、数据、笔记本、对话——都装在里面，和你别的项目彼此隔开。",
  "When you enter the app, it asks you to open a project: create a new one (give it a name), or open a folder where your materials already live. Pick one and start working — that folder is your workspace until you switch projects from the top-left.":
    "进入 app 时，它会让你先打开一个项目：新建一个（起个名字），或打开一个已经装着你资料的文件夹。选一个就开始干活——在你从左上角切换项目之前，那个文件夹就是你的工作区。",
  "Just want to try it first? You can also run a quick demo:": "只想先试试？也可以跑一个快速演示：",
  "A regression example on Stata's built-in auto data — it checks the model, Stata and the results panel in one pass. Opens a new session with the message pre-filled.":
    "用 Stata 自带的 auto 数据运行一个回归示例，依次检验模型、Stata 与结果面板。会打开一个新会话，消息已预填，发送即可。",
  "A regression example on Python (the app's bundled interpreter, no Stata needed) — it checks the model and the results panel in one pass. Opens a new session with the message pre-filled.":
    "用 Python（应用自带的解释器，无需 Stata）运行一个回归示例，依次检验模型与结果面板。会打开一个新会话，消息已预填，发送即可。",
  "Run a quick analysis demo with Python (use the app's bundled uv/Python — install pandas and statsmodels if they are missing): build a small synthetic dataset of about 200 rows where an outcome depends on two predictors plus noise, fit an OLS regression with statsmodels, show me the coefficient table, and save the results as a .qreg file so I can open them in the results panel.":
    "用 Python 跑一个快速分析演示（用应用自带的 uv/Python，缺 pandas、statsmodels 就装上）：构造一个约 200 行的合成数据集，让被解释变量依赖两个预测变量加噪声，用 statsmodels 拟合一个 OLS 回归，把系数表给我看，并把结果保存成 .qreg 文件，方便我在结果面板里打开。",
  "Open the demo": "打开演示",

  // Guidance bar: one slot that always answers "what do I do now"
  "To use the workbench, connect a model first.":
    "首次使用需要先连接一个模型，完成后即可进入工作台。",
  Connected: "已连接",
  "Ready:": "已就绪：",
  "Will you use Stata for analysis?": "需要用 Stata 做分析吗？",
  "Connect Stata (1–2 min)": "连接 Stata（约 1–2 分钟）",
  "Not now — enter the workbench": "暂不需要，进入工作台",
  "R and Python analyses work out of the box; connect Stata here after installing it.":
    "R 和 Python 分析开箱即用；装好 Stata 后可回本页接通。",

  // Step result cards
  "Verified with a live request when the key was saved.": "保存时已实际调用验证通过。",
  "Current model": "当前模型",
  "Change provider or API key…": "更换服务商或 API key…",
  "The bridge passed a live check in its isolated environment; the agent can run do-files.":
    "桥接已在独立环境中通过连通测试，助手可以直接运行 do 文件。",
  Recheck: "重新检测",
  "Finish step 1 first": "先完成第 1 步",
  "Paste the key first — the field above is still empty.": "请先粘贴 API key。",
  "Installing the Stata bridge into an isolated environment (uses the app's own Python — no separate download)…":
    "正在把 Stata 桥接装进独立环境（用应用自带的 Python，无需另外下载）…",
  "Other providers with a key are also available — switch below.":
    "检测到你还有其他已配 key 的服务商——可在下面切换。",
  "Testing the bridge…": "正在验证连接…",
  Retry: "重试",
  "Enter the workbench": "进入工作台",

  // Connectivity-check failures: what happened + how to fix, never a bare code
  "The key was rejected — it may be mistyped or deleted. Copy it again from the provider's site and paste the whole thing.":
    "服务商拒绝了这个 key：可能复制有误，或已被删除。请重新复制后再试。",
  "The key works, but the account has no balance. Top up on the provider's site, then retry.":
    "key 有效，但账户余额不足。请充值后重试。",
  "The provider says too many requests — wait a few seconds and retry.":
    "请求过于频繁，请稍候重试。",
  "Could not reach the provider — check your internet connection (or proxy), then retry.":
    "无法连接服务商。请检查网络或代理设置后重试。",
  "The provider returned an unexpected error — retry in a minute.":
    "服务商返回错误，请稍后重试。",
  "The isolated environment was not created — run Enable Stata again.":
    "独立环境未创建成功，请再次点击「连接 Stata」。",
  "The bridge package did not install cleanly — run Enable Stata again.":
    "桥接组件未安装完整，请再次点击「连接 Stata」。",
  "Fishes is fixing this…": "Fishes 正在修复…",
  "Fishes's diagnosis": "Fishes 的诊断",
  "Handing the failure to Fishes…": "正在把问题交给 Fishes…",
  "Not connected yet — Fishes keeps checking and connects the moment it can.":
    "尚未连接 — Fishes 会持续检测,就绪即自动连上(若需你操作,见下方)。",
  "Stata diagnosis": "Stata 诊断",
  'The search couldn\'t find Stata. If it\'s installed, use "Choose the Stata program manually" to point at it; otherwise skip — R and Python analyses work without it.':
    "没能搜索到 Stata。如果本机已安装，用「手动选择 Stata 程序」直接指给它；未安装则可跳过——R 和 Python 分析不受影响。",
  "That selection doesn't contain a runnable Stata program — pick the Stata executable itself (on macOS, the Stata app).":
    "所选内容里没有可运行的 Stata 程序——请选择 Stata 的可执行文件（macOS 上选 Stata 应用本体）。",

  // Environment check + feedback
  "Environment check": "运行环境",
  "Nothing here needs a manual install — the app manages Python itself.":
    "以下组件由应用自动管理，无需手动安装。",
  "OpenCode runtime": "OpenCode 运行时",
  "Bundled inside the app and started automatically — nothing to install.":
    "内置组件，随应用自动启动。",
  "Found on this computer; analyses can also use the app-managed Python.":
    "本机已安装；应用也自带托管版本，两者均可使用。",
  "Not installed system-wide — fine. The app provisions its own via the bundled uv when needed.":
    "本机未安装。需要时应用会自动配置，无需处理。",
  "Detected. Enable the bridge in step 2 and the agent can run do-files.":
    "已检测到。在第 2 步启用后即可使用。",
  "Not detected — optional. R and Python analyses work without it.":
    "未检测到。此项为可选，R 和 Python 分析不受影响。",
  "Download mirrors": "下载源",
  "China mirrors are on (TUNA / npmmirror) — Python and packages download from domestic sources.":
    "已启用国内镜像（TUNA / npmmirror），依赖从国内源下载。",
  "Using default sources. On a Chinese-locale system, domestic mirrors switch on automatically.":
    "使用默认源。系统语言为中文时自动切换到国内镜像。",
  "Ran into a problem?": "遇到问题？",
  "Report a problem": "反馈问题",
  "Opens a prefilled report — a screenshot plus one sentence is enough.":
    "打开一份预填好的反馈单。",
};
