<div align="center">

<img src="./apps/desktop/src/assets/praxis-mark.svg" width="88" alt="Praxis" />

# Praxis

**面向社会科学研究的 AI 工作台。**
从研究问题,到可投稿的成果。

一个**本地优先**、**模型无关**的桌面应用,把一个研究问题变成可投稿的成果——由你逐列裁决
成终稿的回归表、发表级图、由你逐条拍板的质性编码,以及同时编译成期刊 PDF **和** Word 的
稿件。它不是聊天框:每个结果都落成你拥有的文件,而且你能读到自己的数据究竟是怎么被处理的。

<p><a href="./README.md">English</a> · <b>中文</b></p>

<p>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/shell-MIT-blue.svg" alt="外壳 MIT"></a>
  <img src="https://img.shields.io/badge/model-open--core-C06A3E" alt="open-core">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="平台">
  <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React-24C8DB" alt="Tauri + React">
</p>

</div>

---

## 写给谁

想要一个 AI 科研助手、但不该为此去配置终端、编码智能体或 API 的社科研究者。Praxis 就是一个
普通桌面应用:装上、粘贴一个模型 key,它就带你把定量、质性或混合方法的活儿走完。

## 它做什么

Praxis 围绕三条研究泳道,更围绕**由你拍板**来组织:

- **定量** —— 给它一份数据。它做数据体检、跑基准模型菜单(OLS → 聚类标准误 → 固定效应)
  和稳健性检验,把这些模型作为**候选**交到你手上的回归裁决台。由**你**采纳哪些进终表;每个
  数字都能回溯到一份可复现的 do 文件。图默认就是发表级(白底、坐标轴带标签、统一配色)。
- **质性** —— 把访谈稿开放编码成候选码,由你逐条采纳或拒绝;可导出 REFI-QDA(`.qdpx`)供
  NVivo / MAXQDA 使用——诠释权始终在人这边。
- **写作** —— 把综述或论文同时编译成期刊 **PDF**(LaTeX)和期刊 **Word**(中文社科或 APA
  格式),同一份稿子两样都出。

结果是工作区里的文件,不是成堆的聊天文字——而且最要紧的那个,会在一轮结束时自动出现在对话旁边。

## 你的数据是怎么被处理的

这正是外壳开源的理由:**你能读到应用究竟怎么对待你的数据,并在代码里逐条核实。** 下面没有一句
营销话——每条保证都指向实现它的那个文件。

| 保证 | 在哪里核实 |
|---|---|
| **你的文件和原始数据留在本机。** 智能体在你选的工作区文件夹里运行,绝不触及文件系统根目录。 | `src-tauri/src/runtime.rs` — `spawn_sidecar` 设 `current_dir(workspace)` |
| **模型 key 存在本地一个仅属主可读的文件里**(目录 `0700`、文件 `0600`)——绝不进工作区、留痕或导出物。 | `src-tauri/src/runtime.rs` — `tighten_private` |
| **调试日志里的 key 会被脱敏**,日志本身也仅属主可读——一份 bug 报告泄不出凭据。 | `src-tauri/src/debug_log.rs` — `redact` |
| **没有遥测、没有分析、不回传。** 数据只在一轮对话中离开——后台什么都不发。 | 全仓 grep:无 `posthog` / `sentry` |
| **智能体运行时只绑定本机、且有密码。** 绑 `127.0.0.1`,每次启动生成一个只存在内存里的随机密码,不落盘——本地网页扫端口也驱动不了它、读不到你的 key。 | `src-tauri/src/runtime.rs` — `server_password` |
| **危险操作先问。** 删文件、装依赖、远程连接、联网抓取默认都要你批准;应用以手动批准模式出厂。 | `src-tauri/src/opencode_config.rs` — `DANGEROUS_BASH` |
| **唯一离开本机的,是你发给自己选的模型服务商的请求**——和你用那家网页版发的数据一样。可选的科研连接器(文献检索、FRED 等)只有你启用才会联网。 | 应用内 `设置 → 隐私与数据流` |

应用里也在**设置 → 隐私与数据流**用大白话写明这些,并要求任何行为变更都在同一个提交里同步这段文案。

## Open-core:这个仓库里有什么

Praxis 是 **open-core**,这个切分是刻意的:

- **本仓库是外壳——MIT 许可、完全可审计。** Tauri 桌面应用、界面,以及运行时集成层(key 怎么
  存、sidecar 怎么被沙箱到你的工作区、什么会离开本机)。这部分是你必须能信任的,所以它开源。
- **研究方法论是独立的专有层。** 做批注、三级质性编码、回归裁决、期刊排版、方法论审查的那些
  skill 和 agent,随安装包分发,但**不在**本仓库里。那份手艺,才是产品。
- **第三方组件各自持有其许可**,在构建时拉取而非塞进本仓库:[OpenCode](https://opencode.ai)
  运行时、[`uv`](https://github.com/astral-sh/uv)、以及 Anthropic 的文档 skill(docx/pdf/pptx/xlsx,
  专有、不可再分发)。

所以只用本仓库能构建出可用的外壳;完整产品构建还会拉入那层私有方法论。

## 从源码构建

> **前置:** [Node.js](https://nodejs.org) ≥ 20、[pnpm](https://pnpm.io) 9、
> [Rust 工具链](https://rustup.rs)(Tauri 需要)。macOS 或 Windows。

```bash
git clone https://github.com/Lambenthan/praxis
cd praxis
pnpm install

# 拉取锁定版本的 sidecar(不入 git,各自持有许可):
bash scripts/dev/fetch-opencode.sh   # OpenCode 运行时
bash scripts/dev/fetch-uv.sh         # uv,用于隔离的 Python/Jupyter 环境

# 开发外壳,或构建安装包(.dmg / .app / NSIS / .msi):
pnpm --filter @ai4s/desktop tauri dev
pnpm --filter @ai4s/desktop tauri build
```

方法论 skill 在独立的私有层里,构建或运行外壳都不需要它。首次启动时应用会自动拉起内置运行时;
安装向导会带你连接模型、(可选)启用 Stata。

## 更新

应用启动时会检查更新;有更新的签名版本时,弹一个一键**更新并重启**(或稍后)。更新经过加密
签名,公钥内置在应用里,私钥绝不随包分发。发布流程见
[`scripts/release/release.sh`](./scripts/release/release.sh)。

## 许可

**本仓库中的外壳是 [MIT](./LICENSE)。** 方法论 skill 是独立的专有层(不含在此)。内置的第三方
组件——OpenCode、uv、Anthropic 的文档 skill——各自持有其许可。

> 这是科研工具,产出是草稿——投稿或决策前请核实数字、引用与论断,并请领域专家把关。

## 致谢

基于 [Tauri](https://tauri.app) 与 [OpenCode](https://opencode.ai) 构建。fork 自 MIT 的
[open-science](https://github.com/ai4s-research/open-science),血缘记录在
[`UPSTREAM_FREEZE.txt`](./UPSTREAM_FREEZE.txt)。
