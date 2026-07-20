<div align="center">

<img src="./apps/desktop/src/assets/fishes-mark.svg" width="88" alt="Fishes" />

# Fishes

**面向社会科学研究的 AI 工作台。**

一个本地优先、模型无关的桌面应用,用于定量、定性与混合方法研究。它给出回归模型供你逐列
裁决成终表,产出发表级图,把访谈稿编码成候选码供你采纳或拒绝,并把稿件编译成期刊 PDF 与
Word。结果都保存为工作区里的文件,应用也写明了你的数据是怎么被处理的。

<p><b>中文</b> · <a href="./README.en.md">English</a></p>

<p>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/shell-MIT-blue.svg" alt="外壳 MIT"></a>
  <img src="https://img.shields.io/badge/model-open--core-C06A3E" alt="open-core">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey" alt="平台">
  <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React-24C8DB" alt="Tauri + React">
</p>

</div>

---

## 下载安装

**[Releases](https://github.com/Lambenthan/fishes/releases/latest) 页面里就是封装好的成品安装包**——不用配环境、不用编译源码,选对应系统的文件,双击就能用。

**Windows** —— 下载安装包,双击运行:

| 安装包 | 什么时候选 |
|---|---|
| **[`Fishes_0.3.0_x64-setup.exe`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_x64-setup.exe)** ✅ **推荐** | 绝大多数用户。双击安装,体积小,自带自动更新。 |
| [`Fishes_0.3.0_x64_en-US.msi`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_x64_en-US.msi) | 备选 —— 需要 MSI 做企业/批量部署时用。 |

大多数人直接下 **`.exe`** 即可。所有版本都在
[**Releases**](https://github.com/Lambenthan/fishes/releases/latest) 页面。

**macOS(Apple Silicon)** —— 下载 DMG,打开后把 Fishes 拖进「应用程序」:

[`Fishes_0.3.0_aarch64.dmg`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_aarch64.dmg)

Mac 版尚未做苹果公证,**首次**打开会被系统拦一下(提示"无法验证是否含恶意软件"——不是包有问题,是没买苹果签名)。放行一次即可,以后正常双击:

1. 双击 Fishes,弹窗点「完成」(**别**拖进废纸篓)。
2. 打开「系统设置 → 隐私与安全性」,往下滚到「安全性」区,在"已阻止 Fishes 以保护你的 Mac"旁边点「仍要打开」。
3. 输入开机密码,再点「打开」。之后就当普通应用双击即可,不用再放行。

_(备选 —— 终端跑一条:`xattr -cr /Applications/Fishes.app`,然后双击打开。较新版 macOS 上"右键→打开"已不能绕过,请用上面的设置法。Intel Mac 选 [`Fishes_0.3.0_x64.dmg`](https://github.com/Lambenthan/fishes/releases/download/v0.3.0/Fishes_0.3.0_x64.dmg),放行步骤相同。)_

**Linux** —— Releases 页提供 `.deb` 与 `.rpm`。

安装后首次打开会引导你连接一个模型(推荐 **DeepSeek**,国内可直连、价格低),
粘贴 API key 即可开始。**Stata 为可选**,本机装了才需要连接。

## 写给谁

想要 AI 科研助手、又不愿为此配置终端、编码智能体或 API 的社科研究者。Fishes 像普通桌面
应用一样安装。粘贴一个模型 key,它就带你把定量、定性或混合方法的工作做下去。

## 它做什么

Fishes 围绕三条研究泳道组织,决定权在研究者手里。

- **定量。** 它做数据体检、一套基准模型菜单(OLS、聚类标准误、固定效应)和稳健性检验,再把
  这些模型作为候选交给你。由你选择哪些进终表。每个数字都能回溯到一份可复现的 do 文件。图用
  素净的发表样式:白底、坐标轴带标签、单一配色。
- **定性。** 它把访谈稿开放编码成候选码,由你采纳或拒绝,并可导出 REFI-QDA(`.qdpx`)供
  NVivo 与 MAXQDA 使用。
- **写作。** 它把综述或论文编译成期刊 PDF(LaTeX)和期刊 Word(中文社科或 APA 格式),
  来自同一份稿件。

结果都保存为工作区里的文件。一轮结束时,相关的那个文件会在对话旁边打开。

## 你的数据是怎么被处理的

外壳开源,这些说法都能在代码里核对。下表每一行都指向实现它的文件。

| 说法 | 在哪里核对 |
|---|---|
| 你的文件和原始数据留在本机。智能体在你选的工作区文件夹里运行,不在文件系统根目录。 | `src-tauri/src/runtime.rs` — `spawn_sidecar` 设 `current_dir(workspace)` |
| 模型 key 存在本地一个仅属主可读的文件里(目录 `0700`、文件 `0600`),不写入工作区、留痕或导出物。 | `src-tauri/src/runtime.rs` — `tighten_private` |
| 调试日志里的 key 会被脱敏,日志本身也仅属主可读。 | `src-tauri/src/debug_log.rs` — `redact` |
| 没有遥测、分析或后台上报。数据只在一轮对话中离开。 | 全仓 grep:无 `posthog` / `sentry` |
| 智能体运行时绑定 `127.0.0.1`,并要求一个每次启动新生成、只存内存的密码。扫本地端口的网页驱动不了它,也读不到 key。 | `src-tauri/src/runtime.rs` — `server_password` |
| 删文件、装依赖、远程连接、联网抓取都要经过批准。应用以手动批准模式出厂。 | `src-tauri/src/opencode_config.rs` — `DANGEROUS_BASH` |
| 唯一离开本机的数据,是发给你自己所选模型服务商的请求,与该服务商网页版收到的一致。可选的科研连接器,只有你启用才联网。 | `src/components/settings/DataFlowCard.tsx` |

应用在**设置 → 隐私与数据流**里用平白语言重述这些,并要求行为变更时在同一提交里同步这段文字。

## Open-core:这个仓库里有什么

本仓库是外壳,采用 MIT 许可:Tauri 桌面应用、界面,以及运行时集成层,也就是 key 怎么存、
智能体怎么被沙箱到工作区、什么会离开本机。

研究方法论是独立的专有层。做批注、定性编码、回归裁决、期刊排版和方法论审查的那些 skill 与
agent,随签名的安装包分发,不在本仓库。

第三方组件各自持有其许可,在构建时拉取,不并入本仓库:[OpenCode](https://opencode.ai)
运行时、[`uv`](https://github.com/astral-sh/uv),以及 Anthropic 的文档 skill
(docx/pdf/pptx/xlsx,专有,不可再分发)。

用本仓库构建得到外壳。完整产品构建还会包含那层私有方法论。

## 它怎么运作

```
你的问题
   │
   ▼
[ 计划 ] ──▶ [ 批准 ] ──▶ [ 执行 ]        Stata / 本地 Python 内核 / shell、
   ▲            ▲            │             MCP 工具,都在你的机器上
   │            │            ▼
   │        你回答       [ 结果落成文件 ]  ──▶  .qreg 表 · 图 · .qcode
   │       问题 /            │                   编码 · 期刊 PDF + Word
   │       权限              ▼
   └───────────────────  [ 你来裁决 ]      智能体给候选,你采纳或拒绝;每个结果都溯源到代码
```

一切都经由内置的 [OpenCode](https://opencode.ai) 智能体运行时,一个由应用管理的锁定版
sidecar。界面不直接与模型对话,而是走一层薄 SDK,因此 skill、MCP 服务器与模型服务商保持
可插拔。

## 从源码构建

> **前置:** [Node.js](https://nodejs.org) ≥ 20、[pnpm](https://pnpm.io) 9、
> [Rust 工具链](https://rustup.rs)(Tauri 需要)。macOS 或 Windows。

```bash
git clone https://github.com/Lambenthan/fishes
cd fishes
pnpm install

# 拉取锁定版本的 sidecar(不入 git,各自持有许可):
bash scripts/dev/fetch-opencode.sh   # OpenCode 运行时
bash scripts/dev/fetch-uv.sh         # uv,用于隔离的 Python/Jupyter 环境

# 开发外壳,或构建安装包(.dmg / .app / NSIS / .msi):
pnpm --filter @ai4s/desktop tauri dev
pnpm --filter @ai4s/desktop tauri build
```

方法论 skill 是独立的私有层,构建或运行外壳都不需要它。首次启动时应用会拉起内置运行时;
安装向导涵盖连接模型和(可选)启用 Stata。

## 更新

应用启动时检查更新。存在更新的签名版本时,提示更新并重启。更新经过加密签名,公钥内置在
应用里,私钥不随包分发。发布流程见 [`scripts/release/release.sh`](./scripts/release/release.sh)。

## 许可

本仓库中的外壳是 [MIT](./LICENSE)。方法论 skill 是独立的专有层,不含在此。内置的第三方
组件(OpenCode、uv、Anthropic 的文档 skill)各自持有其许可。

> 科研工具,产出是草稿。投稿或决策前请核实数字、引用与论断,并请领域专家把关。

## 致谢

基于 [Tauri](https://tauri.app) 与 [OpenCode](https://opencode.ai) 构建。fork 自 MIT 的
[open-science](https://github.com/ai4s-research/open-science),血缘记录在
[`UPSTREAM_FREEZE.txt`](./UPSTREAM_FREEZE.txt)。
