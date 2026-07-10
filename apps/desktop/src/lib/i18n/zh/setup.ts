/** Setup guide (first-run three steps). Keys are the English source strings. */
export const setupZh: Record<string, string> = {
  Setup: "安装向导",
  "Three steps and the workbench is ready": "三步,工作台就绪",
  "No terminal, no config files. Connect one model, enable Stata if you have it, then run the demo to see the whole path work.":
    "不用命令行,不用改配置文件。连上一个模型;电脑里装了 Stata 就顺手启用;最后跑一遍演示,亲眼看到整条链路能动。",
  "Starting the built-in runtime — this page fills in as soon as it is up…":
    "内置运行时正在启动——就绪后本页会自动填上状态…",

  // Step 1 · model
  "Connect a model": "连接一个模型",
  "The agent needs one AI model behind it. Pick a provider, get a key from its site (like registering an account), paste it here.":
    "助手背后需要一个 AI 模型。选一家服务商,去它官网申请一个 key(和注册账号差不多),粘贴到这里。",
  "cheap, steady, reachable from mainland China": "便宜稳定,国内可直连",
  "the strongest models for long analyses": "最强的模型,适合长分析",
  "one key that unlocks many models": "一个 key 用上多家模型",
  "Get a key from": "去申请 key:",
  "connected — the model is ready.": "已连接——模型就绪。",
  "Could not save the key": "key 保存失败",
  "Other providers, custom endpoints and local models live in":
    "其他服务商、自建接口、本地模型在",
  "Connect a model first": "先完成第一步连接模型",

  // Step 2 · Stata
  "Enable Stata": "启用 Stata",
  "One click installs the Stata bridge into an isolated environment — nothing on your system is touched. Needs a licensed Stata already installed on this computer.":
    "一键把 Stata 桥接装进独立环境,不动你系统里的任何东西。前提是这台电脑已经装好了 Stata。",
  "Stata was detected on this computer.": "已检测到本机装有 Stata。",
  "No Stata found on this computer — install Stata first, or skip this step; R and Python analyses work without it.":
    "本机没有检测到 Stata——先装好 Stata 再回来点,或者跳过这步;R 和 Python 分析不需要它。",
  "Setting up Stata — the first run downloads a managed Python, please wait…":
    "正在配置 Stata——第一次会下载一个独立的 Python,请稍等…",
  "Stata enabled — the agent can now run do-files.": "Stata 已启用——助手可以跑 do 文件了。",
  "Stata setup failed:": "Stata 配置失败:",
  "Stata is connected — the agent can run do-files.": "Stata 已连接——助手可以跑 do 文件。",
  "Setting up…": "配置中…",

  // Step 3 · demo
  "Run the two-minute demo": "跑一个两分钟的演示",
  "A regression demo on Stata's built-in auto data — it exercises the model, Stata and the results workbench in one pass. The message is pre-filled; you just press send.":
    "用 Stata 自带的 auto 数据跑一遍回归演示,一次走通模型、Stata 和结果工作台。消息已经替你填好,按发送就行。",
  "Open the demo": "打开演示",
};
