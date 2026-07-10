/** zh entries for thread / composer / notebook editor + runtime status lines. Key = English source string. */
export const threadZh: Record<string, string> = {
  // runtime.ts status lines
  "Interrupted": "已中断",
  "done": "完成",
  "Writing…": "生成中…",
  "Working…": "处理中…",
  "Esc to interrupt": "Esc 中断",
  "Interrupted — this turn did not finish. Send a new message to continue.":
    "已中断——本轮未完成，发送新消息可继续。",
  "Not connected to the OpenCode runtime.": "尚未连接 OpenCode 运行时。",
  "Connect the runtime first to install skills.": "请先连接运行时，再安装技能。",

  // Composer.tsx
  "Commands": "命令",
  "Remove": "移除",
  "Arguments (optional) — Enter to run": "参数（可选）——按 Enter 运行",
  "Run a shell command in the workspace folder": "在工作区文件夹中运行 shell 命令",
  "Runs this command — type arguments, or press Backspace to edit the name":
    "运行此命令——输入参数，或按 Backspace 编辑名称",
  "Remove command": "移除命令",
  "Runs directly in the session's workspace folder": "直接在会话的工作区文件夹中运行",
  "Add files": "添加文件",
  "Add local files to the workspace": "将本地文件添加到工作区",
  "Approval modes": "审批模式",
  "How should agent actions be approved?": "智能体的操作应如何获得批准？",
  "Approve for me": "由我批准",
  "Asks before deleting, installing, or going remote": "删除、安装或联网操作前会先询问",
  "Full access": "完全权限",
  "Runs every command without asking": "所有命令无需询问直接执行",
  "Approval mode": "审批模式",
  "How agent actions get approved": "智能体操作的批准方式",
  "Stop": "停止",
  "Interrupt this turn (Esc)": "中断本轮（Esc）",
  "Send": "发送",
  "Could not save paste:": "无法保存粘贴内容：",
  "Could not add files:": "无法添加文件：",

  // FigureBlock.tsx
  "Download figure": "下载图片",
  "Add annotation": "添加批注",
  "Annotation": "批注",
  "Add a note…": "添加备注…",
  "Annotation note": "批注备注",

  // InteractionPrompt.tsx
  "The agent needs your input": "智能体需要你的输入",
  "Skip": "跳过",
  "Asked by": "提问方：",
  "Or type your own answer…": "或输入你自己的答案…",
  "Or type your own answer… (Enter to send)": "或者直接输入你自己的看法…(回车提交)",
  "Submit": "提交",
  "The agent asks permission:": "智能体请求权限：",
  "Reject": "拒绝",
  "Always allow": "始终允许",
  "Allow once": "允许一次",

  // ReviewerCard.tsx
  "Reviewer": "评审员",
  "finding": "发现",
  "findings": "发现",
  "dismissed": "已忽略",
  "Warn": "警告",
  "OK": "正常",
  "Error": "错误",
  "citation": "引用",
  "number": "数字",
  "figure ↔ code": "图 ↔ 代码",
  "domain": "领域",
  "integrity": "完整性",
  "Dismiss finding:": "忽略发现：",
  "Dismiss this finding": "忽略此项发现",
  "All findings dismissed.": "所有发现均已忽略。",

  // ThreadView.tsx
  "Example · read-only": "示例·只读",
  "This is a sample session. Start a live agent session to chat for real.":
    "这是一个示例会话。开启真实的智能体会话即可开始对话。",
  "New session": "新建会话",

  // ToolCallRow.tsx
  "Pending": "待处理",
  "Running": "运行中",
  "Waiting": "等待中",
  "Success": "成功",
  "Warning": "警告",
  "Failed": "失败",
  "step": "步",
  "No steps recorded.": "暂无步骤记录。",

  // WorkflowStarters.tsx
  "What should we look into?": "我们该研究点什么？",
  "Describe your analysis below — or start from one of these.":
    "在下方描述你的分析需求——或从以下几项开始。",
  "Could not set up the example:": "无法设置示例：",
  "Qualitative research": "质性研究",
  "Quantitative research": "定量研究",
  demo: "演示",
  guided: "向导",
  "Start a research project": "开始一个研究项目",
  "A resident navigator walks you through the whole project — framing, gap check, design, analysis, review — pausing at every decision that is yours.":
    "研究主管全程陪跑——选题、空白核查、设计、分析、审稿，每到该你拍板的地方就停下来等你。",
  "Start a research project and guide me through it step by step.":
    "我想开始一个研究项目，请你一步步带我走。",
  "Start fresh": "全新开始",
  "A new empty folder — begin at the question itself.": "在一个新文件夹里，从研究问题本身开始。",
  "Start from my materials": "从我的材料开始",
  "Pick the folder that already holds your data and literature.":
    "选择已经装着你的数据和文献的那个文件夹。",
  "Start a research project and guide me through it step by step. My materials (data, literature) are already in this workspace — take stock of them first.":
    "我想开始一个研究项目，请你一步步带我走。我的材料（数据、文献）已经放在这个工作区里了——请先盘点一遍再开始。",
  // ResearchStateChip.tsx
  "Research project state — click to open research-state.json":
    "研究项目状态——点击打开 research-state.json",
  "decision pending": "项待拍板",
  "decisions pending": "项待拍板",
  "Framing": "选题定调",
  "Gap check": "空白核查",
  "Design": "研究设计",
  "Collection": "数据采集",
  "Analysis": "分析",
  "Review": "审稿",
  "Writing": "写作",
  "Done": "完成",
  "Open coding": "开放编码",
  "Open coding on a transcript — candidates land in the adjudication workbench.":
    "对转录稿做开放编码——候选进入裁决工作台。",
  "Open-code this interview and produce a .qcode file:\n\n[paste the transcript here, or attach the file with the paperclip]":
    "用开放编码分析这份访谈，产出 .qcode 文件：\n\n【把访谈文本粘贴在这里，或用回形针附上转录稿文件】",
  "Export to NVivo / MAXQDA": "导出到 NVivo / MAXQDA",
  "Turn an adjudicated .qcode into a REFI-QDA (.qdpx) exchange package.":
    "把裁决过的 .qcode 转成 REFI-QDA（.qdpx）交换包。",
  "Export the coding file [open_coding.qcode] in my workspace as a REFI-QDA .qdpx package that NVivo / MAXQDA can import.":
    "把工作区里的编码文件【open_coding.qcode】导出为 REFI-QDA 交换包（.qdpx），供 NVivo / MAXQDA 导入。",
  "Code a sample interview": "编码一段示例访谈",
  "A short remote-work interview, coded end to end — adjudicate the result.":
    "一段远程办公主题的短访谈，端到端编码后直接进裁决台。",
  "Open-code this interview and produce a .qcode file: Interviewee A: It's not that I refuse to work on site, it's that the office routine makes me feel like I'm acting. I clock in at nine every day, but the real productive stretch is three or four hours; the rest of the time I'm performing busyness. Later I quit and took remote contracts, and my output actually went up. With nobody watching me, I'm harder on myself.":
    "用开放编码分析这份访谈，产出 .qcode 文件： 受访者A：其实我不是不想坐班，是坐班那套让我觉得自己在演戏。每天九点打卡，但真正有产出的可能就那三四个小时，剩下时间都在假装很忙。后来我干脆辞了，接远程的活，反而效率高了。没人盯着我，我对自己反而更狠。",
  "Research design": "研究设计",
  "Say you want to know whether patient capital affects a firm's green transition. It fixes the outcome, the identification strategy, the controls, and what would falsify the hypothesis before anything runs.":
    "比如你想弄清「耐心资本会不会影响企业绿色转型」，它先把被解释变量、识别策略、控制变量和证伪条件定下来，再动手跑。",
  "Design this study before running anything: from my question, produce a decision-complete research design (outcome and key regressor, identification strategy, controls with reasons, sample, model list, and the falsification condition), grounding in the data and the field's conventions, and stop for my sign-off before execution. Question: [what you want to find out]. [attach the dta/csv or codebook if you have one]":
    "跑任何东西之前先把这个研究设计好：从我的问题出发，产出一份决策完备的研究设计（被解释变量与核心解释变量、识别策略、带理由的控制变量、样本、模型清单、以及证伪条件），扎根在数据和该领域惯例上，执行前停下来等我签字。研究问题：【你想搞清楚什么】。【有 dta/csv 或 codebook 就用回形针附上】",
  "Reviewer 2": "审稿人2",
  "Pre-submission review": "投稿前审稿",
  "Hand it your results.qreg. Five referee lenses catch problems like standard errors clustered at the wrong level, or a finding that holds in only one specification.":
    "把你的 results.qreg 交给五个审稿视角，挑出「标准误聚错层」「结论只在一个设定下显著」这类问题，给一份书面意见。",
  "Run a pre-submission methodology review on my results file [results.qreg] in the workspace: the five lenses — claim↔evidence, reproducibility re-run, methodology soundness, an adversarial Reviewer 2 that tries to reject the finding, and literature/context — and write me a referee report with the blocking issues in priority order. Do not change my models.":
    "对我工作区里的结果文件【results.qreg】做投稿前方法学审稿：五路视角——假设↔证据、可复现重跑、方法学健全性、试图拒稿的对抗式审稿人2、文献与语境——给我写一份审稿意见，把阻断问题按优先级列出。不要改我的模型。",
  autopilot: "直通",
  "Analyze the dataset": "分析这份数据",
  "Hand it a firm-level panel. It runs the data check, traced cleaning, a baseline model menu, and robustness, pausing only to confirm the specification and hand you the candidate table.":
    "给它一份公司面板数据，它做完数据体检、留痕清洗、基准模型、稳健性检验，只在确认设定和交付候选表两处停下等你。",
  "Autopilot this dataset end to end with Stata: run the whole empirical pipeline — data health check, traced cleaning, a baseline model menu (OLS → clustered SE → fixed effects) plus a couple of robustness checks — and stop only to confirm the specification with me and to hand me the candidate .qreg. Outcome and key regressor: [say what you want explained, or let me propose one]. [attach the dta/csv file]":
    "用 Stata 直通分析这份数据：把整条实证链路一口气跑穿——数据体检、留痕清洗、基准模型菜单（OLS → 聚类标准误 → 固定效应）外加两三个稳健性检验——只在两处停下来：跟我确认设定、把候选 .qreg 交给我。被解释变量与核心解释变量：【说你想解释什么，或让我替你提一套】。【用回形针附上 dta/csv 文件】",
  "Baseline regressions": "基准回归",
  "Say you are testing how years of schooling move log wage. It runs OLS, then clustered standard errors, then fixed effects into one .qreg table.":
    "比如检验「受教育年限如何影响工资对数」，依次跑 OLS、聚类标准误、固定效应，汇成一张 .qreg 表。",
  "Run an empirical analysis on my data with Stata: descriptive statistics first for me to confirm, then baseline regressions (OLS, clustered SE, fixed effects) into a .qreg results file. Outcome variable: [Y]; key regressor: [X]. [attach the dta/csv file]":
    "用 Stata 对我的数据做实证分析：先出描述统计让我确认，再跑基准回归（OLS、聚类标准误、固定效应），产出 .qreg 结果文件。被解释变量：【Y】；核心解释变量：【X】。【用回形针附上 dta/csv 文件】",
  "Regressions on auto data": "auto 数据回归",
  "Uses Stata's built-in auto data: price on mpg and weight, three models, straight into the adjudication workbench.":
    "用 Stata 自带的 auto 数据：price 对 mpg 和 weight，跑三个模型，直接进裁决工作台。",
  "Using Stata's built-in demo data (sysuse auto), run an empirical demo: outcome price, key regressors mpg and weight; fit plain OLS, then add foreign as a control, then rep78 fixed effects via areg; produce a results.qreg file with all models as candidates.":
    "用 Stata 内置的演示数据（sysuse auto）做实证分析演示：被解释变量 price，核心解释变量 mpg 和 weight；先跑朴素 OLS，再加入 foreign 控制，再用 areg 做 rep78 固定效应；所有模型作为候选，产出 results.qreg。",

  // WorkspaceChip.tsx
  "Workspace": "工作区",
  "— click to choose a different folder": "——点击选择其他文件夹",
  "Starts in a new dated folder": "将在一个新的按日期命名的文件夹中开始",
  "— click to choose a folder instead": "——点击改为选择一个文件夹",
  "Choose session folder": "选择会话文件夹",
  "Switching…": "切换中…",

  // ArtifactCard.tsx
  "via": "通过",

  // StepSummaryRow.tsx
  "steps": "步",

  // NotebookEditor.tsx
  "could not read the notebook": "无法读取该笔记本",
  "Could not save:": "无法保存：",
  "running…": "运行中…",
  "(local kernel available only in the desktop app)": "（本地内核仅在桌面应用中可用）",
  "Interrupted — the kernel was restarted; variables were reset.": "已中断——内核已重启，变量已重置。",
  "kernel error:": "内核错误：",
  "Back to notebooks": "返回笔记本列表",
  "Saved": "已保存",
  "Unsaved": "未保存",
  "Shift/⌘+Enter runs a cell · shared with the agent": "Shift/⌘+Enter 运行单元格·与智能体共享",
  "History": "历史",
  "History — every recorded version with its code and conversation":
    "历史 — 每个已记录版本及其代码与对话",
  "Reload from disk": "从磁盘重新加载",
  "Reload (pick up the agent's changes)": "重新加载（获取智能体的更改）",
  "Close inspector": "关闭检查器",
  "Stop cell": "停止单元格",
  "Stop — restarts this notebook's kernel (variables reset)": "停止——重启该笔记本的内核（变量将重置）",
  "Run cell": "运行单元格",
  "Run": "运行",
  "Delete cell": "删除单元格",
  "Cell": "单元格",
  "figure": "图",
  "Add cell": "添加单元格",
};
