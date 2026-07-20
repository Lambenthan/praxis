/** zh entries for thread / composer / notebook editor + runtime status lines. Key = English source string. */
export const threadZh: Record<string, string> = {
  "Export transcript": "导出记录",
  "View changes": "查看改动",
  "Session menu": "会话菜单",
  "Transcript saved": "记录已保存",
  "Changes this session": "本次会话的改动",
  "No files were changed in this session.": "本次会话没有改动任何文件。",
  "Undo": "撤销",
  "Undo this turn": "撤销这一轮",
  "Undo this turn? The reply and everything after it is removed.": "撤销这一轮？这条回复及其之后的内容都会被移除。",
  "tokens": "tokens",
  "Sessions": "会话",
  "Your last message": "你的上一条消息",
  "Copy message": "复制这条消息",
  "Copied": "已复制",
  "Ask anything — @ files, # sessions, / skills, ! shell": "有什么想问的？@ 文件，# 会话，/ 技能，! 命令",
  "Model": "模型",
  // runtime.ts status lines
  "Interrupted": "已中断",
  "The model returned no response. The provider API may be unreachable or misconfigured — check the model and API key in Settings, and your network or proxy.":
    "模型没有返回任何内容。可能是模型 API 连不上或配置有误——请检查设置里的模型与 API key，以及网络 / 代理。",
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
  // WorkspaceBar.tsx + Composer "+" add menu
  "Local": "本地",
  "Everything runs on this computer": "所有计算都在本机进行",
  "Choose a different folder": "选择其他文件夹",
  "Add": "添加",
  "Add files or choose a folder": "添加文件或选择文件夹",
  "Add to the conversation": "添加到对话",
  "Choose folder…": "选择文件夹…",
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
  "Don't want to confirm each time?": "不想每次确认？",
  "Switch to full access": "开启完全权限",
  "— later actions run without asking. You can switch back next to the input box.":
    "——后续操作将不再询问。可随时在输入框旁切换回来。",

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
  "line of output": "行输出",
  "lines of output": "行输出",
  // SessionMenu.tsx / LiveSessionPage.tsx — close controls (aria-label)
  "Close": "关闭",

  // WorkflowStarters.tsx
  "What should we look into?": "我们该研究点什么？",
  "Describe your analysis below — or start from one of these.":
    "在下方描述你的分析需求——或从以下几项开始。",
  "Open a workspace": "打开工作区",
  "Open a project to start": "先打开一个项目再开始",
  "Everything in Fishes lives inside a project folder — your literature, data, notebooks, and conversations together. Create one or open an existing one to begin.":
    "Fishes 里的一切都在一个项目文件夹内——文献、数据、笔记本、对话都在一起。新建一个，或打开已有的，来开始。",
  "Recent projects": "最近项目",
  "Continue without a project": "暂不打开项目",
  "Blank workspace. Open a project to work with your files.":
    "空白工作区。打开一个项目，即可使用其中的文献与数据。",
  "Open a project": "打开一个项目",
  "Could not set up the example:": "无法设置示例：",
  "Qualitative research": "质性研究",
  "Quantitative research": "定量研究",
  demo: "演示",
  "In progress": "待完善",
  guided: "向导",
  // StepActions — 项目内的研究步骤(工作区上下文,点击直接运行)
  "Project ready": "项目就绪",
  "Your project": "你的项目",
  "Type what you need in your own words — or run a step. They build on each other in order, but you can jump to the one you need.":
    "用你自己的话说需求就行——也可以直接跑一步。步骤按序递进,也可以只跳到你需要的那一步。",
  "Quantitative workflow": "定量流程",
  "Qualitative workflow": "质性流程",
  "Try it (demos)": "试一试(演示)",
  "Steps": "步骤",
  "Research steps — run one against this project's folder": "研究步骤——对这个项目文件夹直接运行某一步",
  "You drive. These set up the project folder — the research steps (design, merging, cleaning, regressions…) appear once you are inside the project.":
    "由你主导。这两个入口先建好项目文件夹;进入项目之后,研究步骤(设计、合并、清洗、回归……)才会出现。",
  "Reads your data and dictionary, then fixes the design before anything runs.":
    "先读你的数据和字典,把设计定下来再动手。",
  "Read what is in this workspace first — the data files, the variable dictionary or codebook, and any notes — then design the study before running anything: a decision-complete research design (outcome and key regressor, identification strategy, controls with reasons, sample, model list, and the falsification condition), grounded in the actual data. Stop for my sign-off before any execution.":
    "先读这个工作区里的东西——数据文件、变量字典或 codebook、以及任何笔记——再设计研究,跑任何东西之前:给出一份决策完备的研究设计(被解释变量与核心解释变量、识别策略、带理由的控制变量、样本、模型清单、证伪条件),扎根在真实数据上。执行前停下来等我签字。",
  "Merges the raw tables in this folder into one analysis panel, reporting match rates.":
    "把文件夹里的原始表并成一张分析面板,每步报匹配率。",
  "Merge the raw data files in this workspace into one analysis panel with Stata: identify the candidate tables and the merge keys from the files and the dictionary, confirm the keys with me before merging, then merge step by step, reporting each step's match rate (_merge tabulation), keeping an audit of unmatched observations, and saving a reproducible merge do-file plus the merged panel.":
    "用 Stata 把这个工作区里的原始数据并成一张分析面板:从文件和字典里识别候选表和匹配键,合并前先跟我确认键,然后逐步合并,每一步报告匹配率(_merge 分布),留下未匹配观测的记录,保存可复现的合并 do 文件和合并后的面板。",
  "Filters, missing values, winsorizing — every step logged; ends with descriptives.":
    "筛样本、处理缺失、缩尾——每步留痕,最后出描述性统计。",
  "Clean the analysis data in this workspace with Stata: propose the sample filters this data calls for and confirm them with me, handle missing values, winsorize continuous variables at 1%, and log every step in a do-file with observation counts before and after. Finish with a descriptive-statistics table saved as a .csv.":
    "用 Stata 清洗这个工作区里的分析数据:根据数据本身提出该做的样本筛选并跟我确认,处理缺失值,连续变量按 1% 缩尾,每一步都在 do 文件里留痕并记录前后观测数。最后产出一张描述性统计表存成 .csv。",
  "OLS → clustered SE → fixed effects, into one .qreg table you adjudicate.":
    "OLS → 聚类标准误 → 固定效应,汇成一张由你裁决的 .qreg 表。",
  "Run baseline regressions on the analysis data in this workspace with Stata: take the outcome and key regressor from the research design or the dictionary (confirm with me if ambiguous), show descriptive statistics first, then fit the baseline menu (OLS, clustered SE, fixed effects) into a .qreg results file with every model as a candidate.":
    "用 Stata 对这个工作区里的分析数据跑基准回归:被解释变量和核心解释变量取自研究设计或字典(有歧义就先问我),先出描述统计,再把基准菜单(OLS、聚类标准误、固定效应)拟合进 .qreg 结果文件,每个模型都是候选。",
  "Alternative measures, samples, and a placebo — appended beside the baseline.":
    "换度量、换样本、加安慰剂——并到基准旁边对照。",
  "Run robustness checks on the baseline in this workspace with Stata: an alternative measure of the key variable, an alternative sample or window, and a placebo test where one makes sense. Append every check as a candidate model to the existing .qreg results file so I can adjudicate them against the baseline.":
    "用 Stata 对这个工作区里的基准做稳健性检验:换一个核心变量的度量、换一个样本或窗口,合适的话再做一个安慰剂检验。每个检验都作为候选模型并入已有的 .qreg 结果文件,让我和基准对照裁决。",
  "Five referee lenses over your results file; a written report, models untouched.":
    "五个审稿视角过一遍结果文件;书面意见,不动模型。",
  "Run a pre-submission methodology review on the results file (.qreg) in this workspace: the five lenses — claim↔evidence, reproducibility re-run, methodology soundness, an adversarial Reviewer 2 that tries to reject the finding, and literature/context — and write me a referee report with the blocking issues in priority order. Do not change my models.":
    "对这个工作区里的结果文件(.qreg)做投稿前方法学审稿:五路视角——假设↔证据、可复现重跑、方法学健全性、试图拒稿的对抗式审稿人2、文献与语境——给我写一份审稿意见,把阻断问题按优先级列出。不要改我的模型。",
  "Open-codes the transcripts in this folder into candidates you adjudicate.":
    "把文件夹里的访谈稿开放编码成候选码,由你裁决。",
  "Open-code the interview transcript(s) in this workspace and produce a .qcode file of candidate codes for me to adjudicate. If there are several transcripts, list them and ask which to start with.":
    "对这个工作区里的访谈转录稿做开放编码,产出 .qcode 候选码文件供我裁决。如果有多份转录稿,先列出来问我从哪份开始。",
  "Turns the adjudicated .qcode in this folder into a REFI-QDA (.qdpx) package.":
    "把文件夹里裁决过的 .qcode 转成 REFI-QDA(.qdpx)交换包。",
  "Export the adjudicated .qcode file in this workspace as a REFI-QDA .qdpx package that NVivo / MAXQDA can import. If no .qcode exists yet, say so instead of inventing one.":
    "把这个工作区里裁决过的 .qcode 文件导出为 NVivo / MAXQDA 可导入的 REFI-QDA(.qdpx)交换包。如果还没有 .qcode,就如实说,不要编造。",

  "Autonomous": "自主",
  "Guided": "引导",
  "You drive. These set up the project folder and hand you the composer — no agent takes over. Switch to Guided any time for step-by-step help.":
    "由你主导。这两个入口只帮你建好项目文件夹,然后把输入框交给你,不会有智能体接管。想要一步步带,随时切到「引导」。",
  "Folder ready — type what you need, in your own words.":
    "文件夹已就位——用你自己的话说需求就行。",
  "Project created — type what you need, in your own words.":
    "项目已创建——用你自己的话说需求就行。",
  "Guided mode is ON — the research navigator steers. Click to take over yourself (next message onward).":
    "引导模式已开——研究主管在带流程。点击改为自主(下一条消息起生效)。",
  "Guided mode is OFF — you drive. Click for step-by-step guidance (next message onward).":
    "自主模式——由你主导。点击开启一步步引导(下一条消息起生效)。",

  "Start a research project": "开始一个研究项目",
  "A resident navigator walks you through the whole project — framing, gap check, design, analysis, review — pausing at every decision that is yours.":
    "研究主管全程陪跑——选题、空白核查、设计、分析、审稿，每到该你拍板的地方就停下来等你。",
  "Start a research project and guide me through it step by step.":
    "我想开始一个研究项目，请你一步步带我走。",
  "Start a project from zero": "从零开始一个研究项目",
  "A new empty folder — begin at the question itself.": "在一个新文件夹里，从研究问题本身开始。",
  "Name your project": "给你的研究起个名字",
  "A folder with this name is created at the location below, so you can always find your work.":
    "会在下面这个位置，用这个名字建一个项目文件夹，方便你随时找到自己的东西。",
  "Location": "位置",
  "Change…": "更改…",
  "e.g. Patient capital and green transition": "例如：耐心资本与绿色转型",
  "Cancel": "取消",
  "Create & start": "创建并开始",
  "I already have research materials": "已有研究相关资料",
  "Pick the folder that already holds your data and literature.":
    "选择已经装着你的数据和文献的那个文件夹。",
  "Start a research project and guide me through it step by step. My materials (data, literature) are already in this workspace — take stock of them first.":
    "我想开始一个研究项目，请你一步步带我走。我的材料（数据、文献）已经放在这个工作区里了——请先盘点一遍再开始。",
  // PlanPanel.tsx (plan-as-report chip + panel)
  "Task plan — click to open plan.json": "任务计划——点击打开 plan.json",
  "Step {n} of {m}": "第 {n}/{m} 步",
  "Phase": "阶段",
  "Desired outputs": "预期产物",
  "No readable plan.json next to this file.": "这个文件旁边没有可读的 plan.json。",
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
  "Data merging": "数据合并",
  "Say you have a financial-statements table, a patent table, and province-level macro variables. It merges them into one firm-year panel on stock code and year, reporting the match rate of every step.":
    "比如你手上有财务报表、专利数据和省份宏观变量三份表，它按股票代码和年份并成一张公司-年度面板，每一步都报告匹配率。",
  "Merge my raw data files into one analysis panel with Stata: match on the keys I give, report each step's match rate (_merge tabulation), keep an audit of dropped/unmatched observations, and save a reproducible merge do-file plus the merged panel. Files: [attach or name the dta/csv files]. Keys: [e.g. stock code + year].":
    "用 Stata 把我的原始数据合并成一张分析面板：按我给的键匹配，每一步报告匹配率（_merge 分布），留下被删和未匹配观测的记录，保存可复现的合并 do 文件和合并后的面板。文件：【用回形针附上或写明 dta/csv 文件】。匹配键：【例如 股票代码 + 年份】。",
  "Data cleaning": "数据清洗",
  "Say you drop financial and ST firms and winsorize continuous variables at 1%. It logs how many observations each step removes and ends with a descriptive-statistics table.":
    "比如剔除金融业和 ST 样本、连续变量按 1% 缩尾，每一步记下删了多少观测，最后给出一张描述性统计表。",
  "Clean my analysis data with Stata: apply the sample filters I give, handle missing values, winsorize continuous variables at 1%, construct the variables I list, and log every step in a do-file with observation counts before and after. Finish with a descriptive-statistics table saved as a .csv. Data: [attach the dta/csv]. Filters and variables: [e.g. drop financial and ST firms; build firm age from list date].":
    "用 Stata 清洗我的分析数据：按我给的条件筛样本、处理缺失值、连续变量按 1% 缩尾、构造我列出的变量，每一步都在 do 文件里留痕并记录前后观测数。最后产出一张描述性统计表存成 .csv。数据：【用回形针附上 dta/csv】。筛选条件与变量：【例如 剔除金融业和 ST 样本；用上市日期构造公司年龄】。",
  "Robustness checks": "稳健性检验",
  "Say your baseline holds. It swaps in an alternative measure of the key variable, an alternative sample window, and a placebo test, appending each to the .qreg table beside the baseline.":
    "比如基准成立了，它换一个核心变量度量、换一段样本窗口，再做一次安慰剂检验，逐个并进 .qreg 表和基准对照。",
  "Run robustness checks on my baseline with Stata: an alternative measure of the key variable, an alternative sample or window, and a placebo test where one makes sense. Append every check as a candidate model to the .qreg results file so I can adjudicate them against the baseline. Baseline: [point to results.qreg or describe the model]. [attach the dta/csv file]":
    "用 Stata 对我的基准做稳健性检验：换一个核心变量的度量、换一个样本或窗口，合适的话再做一个安慰剂检验。每个检验都作为候选模型并入 .qreg 结果文件，让我和基准对照裁决。基准：【指向 results.qreg 或描述模型】。【用回形针附上 dta/csv 文件】",
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
  "Choose a project folder": "选择一个项目文件夹",
  "Starts in a new dated folder — pick a project folder to work in":
    "尚未打开项目——选一个项目文件夹开始工作",
  "Open folder…": "打开文件夹…",
  Recent: "最近",
  "Switching…": "切换中…",

  // ArtifactCard.tsx
  "via": "通过",

  // StepSummaryRow.tsx
  "steps": "步",
  "Generated": "生成的文件",

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
