# 自定义 Skill

这个文件夹里的每个 `*.md`（本文件除外）都是一个 Skill。`artgo up` 启动时会把它们同步进 Skill 库并发布；内容有变化时自动升版本，没变化就跳过。内置 Skill（海报、局部修改、生成背景、特效字、选区处理、拆层、海报分层、插画分层、设计自检、版式、配色、分层上色、电商用途、TJM 品牌）在 `src/local/backend/workbench/store.js` 里，不在这里。

## 格式

```markdown
---
slug: my-skill                 # 小写字母、数字、短横线，2–60 位，不能与内置 Skill 重名
name: 显示名称
category: workflow             # workflow 工作流 / capability 通用能力 / style 风格 / purpose 用途约束
description: 一句话说明，skill_list 会展示
triggers: 关键词,逗号分隔        # 需求里出现这些词时排序靠前
tools: doc_read, doc_preview, text_create   # workflow / capability 必填：读取后 Agent 只能用这些工具（留空 = 什么都不能改）；style / purpose 不填
---
正文：Agent 调用 skill_load 后拿到的步骤。
```

## 写法建议

- 风格（style）和用途（purpose）是叠加约束，不限制工具，写「怎么选版式、配色、字体、尺寸」。
- 工作流（workflow）和通用能力（capability）写可执行步骤，每步对应具体工具（`artgo tools` 查参数）。
- 最后一步写检查标准：`doc_lint` 要过什么、`doc_preview` 看什么。
- 改完运行 `artgo down && artgo up` 重新同步，`artgo skills` 确认版本。
