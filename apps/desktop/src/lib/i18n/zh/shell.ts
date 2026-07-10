/** zh entries for the sidebar, status pills, command palette, settings cards
 * (Cluster/DataFlow/Modal), and the science connector list. Key = English source string. */
export const shellZh: Record<string, string> = {
  // Sidebar.tsx
  "Collapse sidebar": "折叠侧边栏",
  Beta: "测试版",
  New: "新建",
  Notebooks: "笔记本",
  Files: "文件",
  Skills: "技能",
  History: "历史",
  "No conversations yet.": "暂无会话。",
  example: "示例",
  Delete: "删除",
  Settings: "设置",
  "Delete session?": "删除该会话？",
  "Hide example?": "隐藏示例？",
  "and its messages will be deleted. This cannot be undone.":
    "及其消息将被删除，此操作无法撤销。",
  "will be hidden from the sidebar.": "将从侧边栏中隐藏。",
  Hide: "隐藏",

  // StatusPills.tsx
  Runtime: "运行时",
  Model: "模型",
  "not set": "未设置",

  // CommandPalette.tsx
  "New session": "新建会话",
  "Analyze my data (new workflow)": "分析我的数据(新建工作流)",
  "Audit a report (traceability review)": "审计报告(溯源评审)",
  "Open notebooks": "打开笔记本",
  "Manage skills": "管理技能",
  "Open settings": "打开设置",
  "Toggle light / dark theme": "切换浅色/深色主题",
  "Command palette": "命令面板",
  "Type a command…": "输入命令…",
  "No results.": "无结果。",

  // ClusterCard.tsx
  "Could not read the queue:": "无法读取队列：",
  "Could not read the cluster config (.openscience/hpc.json):":
    "无法读取集群配置(.openscience/hpc.json)：",
  "Could not remove:": "无法移除：",
  Job: "作业",
  canceled: "已取消",
  "Could not cancel": "无法取消",
  "Cluster (HPC)": "集群(HPC)",
  "Run heavy jobs on your Slurm cluster over SSH — connect once, then just ask the agent.":
    "通过 SSH 在你的 Slurm 集群上运行重负载任务——连接一次后，之后只需让智能体代劳。",
  "Available in the desktop app.": "仅在桌面应用中可用。",
  "user@login.hpc.edu — or pick from your ~/.ssh/config":
    "user@login.hpc.edu——或从你的 ~/.ssh/config 中选择",
  "Checking…": "检查中…",
  Connect: "连接",
  "Uses your own SSH keys — nothing is installed on the cluster. Once connected, the agent can write and submit Slurm batch scripts for you and fetch the results back into the workspace.":
    "使用你自己的 SSH 密钥——集群上不会安装任何东西。连接后，智能体可以为你编写并提交 Slurm 批处理脚本，并把结果取回工作区。",
  "checking…": "检查中…",
  "Refresh the job queue": "刷新作业队列",
  "Disconnect this cluster": "断开此集群",
  Remove: "移除",
  "Reading the queue…": "正在读取队列…",
  "Queue unavailable.": "队列不可用。",
  "No jobs in the queue.": "队列中没有作业。",
  "Cancel job": "取消作业",
  "Ask the agent to run an analysis on the cluster — it submits batch scripts here and pulls results back into the workspace.":
    "让智能体在集群上运行分析——它会在这里提交批处理脚本，并把结果取回工作区。",

  // DataFlowCard.tsx
  "Privacy & data flow": "隐私与数据流向",
  "What stays on this machine, and exactly what leaves it.":
    "哪些留在本机，哪些又确切地会发出去。",
  "Stays on this machine": "留在本机",
  "Your workspace files and raw data": "你的工作区文件与原始数据",
  "Code execution — the Python kernel and Jupyter run locally; datasets are processed here, never uploaded in bulk.":
    "代码执行——Python 内核与 Jupyter 均在本地运行；数据集在本机处理，绝不会被批量上传。",
  "Session history and provenance records, in the app's private data folder.":
    "会话历史与溯源记录，保存在应用的私有数据文件夹中。",
  "Provider keys and login tokens — an app-private file readable only by your account; never written to the workspace, provenance, logs, or exports.":
    "提供方密钥与登录令牌——存放在仅你的账户可读的应用私有文件中，绝不会写入工作区、溯源记录、日志或导出文件。",
  "Sent to your model provider": "发送给你的模型提供方",
  "no model configured": "未配置模型",
  "Your messages, and the file contents / command output the agent reads to do the task you asked for.":
    "你的消息，以及智能体为完成你交办的任务而读取的文件内容/命令输出。",
  "Nothing is sent in the background — data leaves only during a conversation turn.":
    "不会有任何后台发送——数据只在一轮对话进行时才会发出。",
  "What the provider retains is governed by its own data policy.":
    "提供方会保留哪些数据，由其自身的数据政策决定。",
  "Skills and MCP servers you add may make their own network calls — review them before installing.":
    "你添加的技能与 MCP 服务器可能会发起自己的网络请求——安装前请先自行核查。",

  // ModalCard.tsx
  "Cloud compute (Modal)": "云端算力(Modal)",
  "Run GPU / elastic jobs on Modal with your own account — then just ask the agent.":
    "用你自己的账号在 Modal 上运行 GPU/弹性任务——之后只需让智能体代劳。",
  "Re-check": "重新检测",
  "Installed, not authenticated": "已安装，未认证",
  "Not installed": "未安装",
  Ready: "已就绪",
  "Ask the agent to run heavy work on Modal — it uses the":
    "让智能体在 Modal 上运行重负载任务——它会使用",
  "skill and your token.": "技能与你的令牌。",

  // lib/scienceConnectors.ts (label/description/discipline shown by SettingsPage's
  // MCP connector list — that consumer already imports useT and wraps these
  // fields with t() at render time; data stays plain English source strings here
  // by the key=English-source i18n design, and per scienceConnectors.test.ts
  // asserting raw discipline values e.g. "materials"/"economics"/"physics").
  "Literature search": "文献检索",
  "Zotero library": "Zotero 文献库",
  "FRED economic data": "FRED 经济数据",
  "all fields": "所有领域",
  statistics: "统计学",
  economics: "经济学",
  "arXiv · PubMed · Crossref · Semantic Scholar · bioRxiv/medRxiv — search & fetch papers":
    "arXiv · PubMed · Crossref · Semantic Scholar · bioRxiv/medRxiv——检索并获取论文",
  "Drive a locally installed Stata (MP/SE/BE) — the agent writes do-files, runs them, and reads the logs":
    "驱动本机已安装的 Stata(MP/SE/BE)——智能体编写 do 文件、运行并读取日志",
  "Search and read your local Zotero library — items, notes, and attachments, no API key needed":
    "检索并读取本机 Zotero 文献库——条目、笔记与附件，无需 API 密钥",
  "Federal Reserve (FRED) economic time series — GDP, inflation, unemployment, rates, and more":
    "美联储(FRED)经济时间序列数据——GDP、通胀率、失业率、利率等",
  "requires Stata already installed on this machine": "需要本机已安装 Stata",
  "requires the Zotero desktop app running with its local API on (Settings → Advanced → Allow other applications)":
    "需要 Zotero 桌面版正在运行且已开启本地 API(设置 → 高级 → 允许本机其他应用访问)",
};
