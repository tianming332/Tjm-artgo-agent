<div align="center">

<img src="docs/images/artgo-logo.png" alt="Art GO" width="160" />

# Art GO Agent

**让你自己的 AI 编程助手变成平面设计师：在真正的分层编辑器里一层一层做图，交付可编辑的 PSD。**

[English](README.md) · 简体中文 · [日本語](README.ja.md)

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Agents](https://img.shields.io/badge/Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20Copilot%20%7C%20Windsurf%20%7C%20Gemini%20CLI-supported-8A2BE2)
![Engine](https://img.shields.io/badge/engine-Rust%20%E2%86%92%20WASM-orange)
![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)

[工作方式](#-工作方式) · [快速开始](#-快速开始) · [能做什么](#-能做什么) · [命令行](#-命令行) · [扩展 Skill](#-扩展-skill) · [协议与版权](#-协议与版权)

</div>

---

## ✨ 为什么做这个

大多数 AI 设计工具交给你的是一张拍平的图。Art GO Agent 不一样：它是一个**给 Agent 用的制图工具**。你在自己的 AI 编程助手里描述需求，助手就用和人一样的编辑工具**一层一层把设计搭出来**：文字、形状、选区、蒙版、调整图层、滤镜、图层样式。每一步都留在图层和历史记录里，最后交付可编辑的 PSD 和 PNG。

思考和决策用的是编程助手自己的模型，**不需要额外的大模型 Key**。只有生成图片素材时才需要生图服务商的 Key；没有 Key，也能用你自己的素材完成整张设计。

## 🧭 工作方式

```
你 ──需求──▶ 你的 AI 编程助手（读 AGENTS.md）
                 │  artgo start / artgo call / artgo finish
                 ▼
             artgo 运行时（本机后台）──▶ 无窗口 Chrome 里的 TJM 编辑器
                 │                       Rust→WASM 引擎 · 工作流 · Skill · 素材库
                 ▼
             projects/<项目>/  需求 · 检查点 · 预览图 · document.psd · final.png
```

- **工作流强制执行**：
  - 必须先分析需求、检查素材、匹配 Skill，才能开始编辑；
  - 读取的 Skill 会限定可用的工具；
  - 删除类操作要等用户确认；
  - 交付前必须对最终画布做一次完整预览并自检。

  助手跳过任何一步，调用都会被直接拒绝。
- **结果看得见**：每次预览都是真实渲染，存成 PNG 文件交给助手看图检查。`artgo progress` 给出一个只读进度页；`artgo up --headed` 可以直接看着编辑器里一层层出图。
- **结构参考**：借鉴了 [OpenMontage](https://github.com/calesthio/OpenMontage)「编程助手就是调度者」的组织方式（AGENTS.md、流程说明、Skill、项目检查点）；本仓库没有使用它的代码。

## 🖼 编辑器与作品

用 `artgo up --headed` 可以看到同一个编辑器；下面是 Agent 做的作品。

<img src="docs/images/ui-editor.png" alt="编辑器界面" width="860" />

| | | |
| :---: | :---: | :---: |
| <img src="docs/images/work-character-sheet.png" alt="角色设定图" width="280" /><br><sub>角色设定图</sub> | <img src="docs/images/work-product-photo.jpg" alt="商业广告摄影" width="280" /><br><sub>商业广告摄影</sub> | <img src="docs/images/work-brand-vis.png" alt="品牌视觉图集" width="280" /><br><sub>品牌视觉图集</sub> |

## 🚀 快速开始

需要 Node 20+ 和 Google Chrome。

```bash
git clone https://github.com/<you>/artgo-agent.git
cd artgo-agent
npm ci
```

然后在这个文件夹里打开你的 AI 编程助手，直接说需求，例如：

> 用 ~/Downloads/product.png 这张商品图，做一张 1080×1350 的上新海报，标题「春季新品」，副标题「全场八折」。

助手会读 `AGENTS.md`，自己启动运行时、建项目、走完工作流，做完后告诉你 `projects/<项目>/document.psd` 在哪里。

**想先不用 Key 试一试**：让助手用 `artgo up --mock` 启动，生图会换成模拟图片，其余流程完全一样。

**需要 AI 生图时**，Key 由你自己在终端里填，不要贴进对话：

```bash
echo "$GEMINI_API_KEY" | node bin/artgo.mjs key add gemini     # 也支持 openai / glm / qwen / doubao
```

Key、素材库和设置只保存在本机的 `.artgo/chrome/` 浏览器配置里，请求直接发给官方接口，不经过任何中转服务器。接口费用由你自己的账户支付。

## 🧩 能做什么

| 流程 | 说明 | 说明文件 |
| --- | --- | --- |
| **海报／横幅** | 用现成素材排版，或先生成背景再组合；标题、副标题保持可编辑 | `pipelines/poster.md` |
| **按反馈修改** | 只改指定的图层和属性，其余不动 | `pipelines/revise.md` |
| **特效字** | 12 种预设（霓虹、金属、金色、贴纸……）、文字变形、立体字 | `pipelines/text-effects.md` |
| **局部处理** | 在选区内调色、抠图、移除，或生成式替换后羽化融合 | `pipelines/region-edit.md` |
| **分层拆解** | 把一张平面图拆成可编辑的 PSD 图层 | `pipelines/decompose.md` |

另外内置电商主图、信息流竖版等用途约束，还有风格 Skill（如 `style-swiss-minimal`）。编辑器支持 PSD/PSB、PNG、JPEG、WebP、TIFF，内置 19 套可商用的中日英字体。

## ⌨️ 命令行

所有命令都输出 JSON，任何编程助手都能直接解析。`node bin/artgo.mjs help` 查看全部命令。

```bash
artgo up [--headed] [--mock]          # 启动；artgo down 停止；artgo progress 进度页
artgo new poster --size 1080x1350     # 或 --image photo.jpg
artgo asset add product.png logo.png
artgo start "<需求原话>"
artgo call report_analysis '{"goal":"…"}'
artgo call -f calls.json              # 一轮提交多个调用
artgo finish "<完成说明>"
artgo export png|psd
artgo tools [工具名]                   # 37 个工具及参数 schema
```

各平台的入口文件都指向同一份 `AGENTS.md`：

| 平台 | 入口文件 |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Codex 等 | `AGENTS.md` |
| Cursor | `.cursor/rules/` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurfrules` |
| Gemini CLI | `GEMINI.md` |

## 🔧 扩展 Skill

在 `skills/` 里放一个带 frontmatter 的 Markdown 文件，就多了一个 Skill（风格、用途、工作流或通用能力均可）。运行时启动时会自动同步并发布。格式见 [`skills/README.md`](skills/README.md)。

## 🗂 目录结构

```
AGENTS.md            给 Agent 的操作说明（各平台入口都指向它）
bin/artgo.mjs          命令行
runtime/             后台运行时：Vite + Playwright Chrome + 本机 JSON-RPC + 进度页
pipelines/           各类任务的分阶段做法
skills/              自定义 Skill
src/                 编辑器（React + TypeScript）
src/agent-host/      外部 Agent 适配器与页面侧接口
src/local/backend/   工作流、工具清单、内置 Skill、生图适配
engine/              Rust → WASM 引擎桥接源码（PhotoCraft v0.6.0）
projects/            你的作品（已加入 .gitignore）
```

## 🧪 开发

```bash
npm test               # 单元测试
npm run typecheck
npm run smoke:agent    # 端到端：真实命令行 + 无窗口 Chrome + 模拟生图
npm run dev            # 只看编辑器界面：http://127.0.0.1:5191
```

运行时只监听 `127.0.0.1`。每次启动都会生成一个随机 token，写在 `.artgo/runtime.json`（权限 600），不带 token 的请求一律拒绝。

## 🤝 参与贡献

欢迎提 Issue 和 PR。提交前请运行 `npm test` 和 `npm run smoke:agent`。提交贡献即表示你同意以 Apache-2.0 授权你的贡献（见协议第 5 条）。

## 📄 协议与版权

- **代码**：[Apache License 2.0](LICENSE)，Copyright 2026 TJM。
  - 可以免费使用、修改、分发，包括商用。
  - 条件是保留许可证和 [NOTICE](NOTICE) 文件，并标明你改过哪些文件。
  - 协议附带专利授权，且**不提供任何担保**。
- **商标**：TJM 名称、`public/brand/` 中的标志、小写「tjm」字标，以及 Art GO 名称与标志（`docs/images/artgo-logo.png`）**不在**本协议授权范围内（Apache-2.0 第 6 条）。Fork 或再分发时必须替换，也不得暗示得到了我们的认可。
- **第三方代码**：PhotoCraft（MIT 或 Apache-2.0 二选一），以及 vgpu、vgpu-optimized-black-hole、ag-psd、React、zustand、sql.js（均为 MIT）。许可原文见 [`third_party/`](third_party)。
- **设计 Skill 参考来源**：部分内置 Skill 改写自 MIT／Apache-2.0 开源项目的思路，来源与协议见 [`third_party/design-skill-sources.md`](third_party/design-skill-sources.md)。
- **字体**：SIL Open Font License 1.1，许可文件放在每个字体目录里。
  - 可以免费用于设计作品，包括商用和嵌入导出文件。
  - 不能单独出售字体文件。
- **你的作品与 AI 内容**：
  - 你创作的内容归你所有。
  - AI 生成的内容还要遵守你所用服务商的使用条款。
  - 你导入的素材，需要你自己确认拥有相应权利。

<div align="center"><sub>为想要「AI 帮我改图」而不只是「AI 帮我生图」的设计师而做。</sub></div>
