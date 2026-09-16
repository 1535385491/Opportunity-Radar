# 飞书卡片预览 — 2026-09-16

以下内容将发送到飞书群：

**📋 五分钟概览**
1. **Claude Code v2.1.273 新增网关提示请求头，暴露工具耗时与上下文压缩元数据**
   Claude Code v2.1.273 为 LLM 网关新增 x-claude-code-request-class、x-claude-code-agent-type、x-claude-code-prev-tool-durations、x-claude-code-compaction、x-claude-code-context-compacted 等请求头，需设置 CLAUDE_CODE_GATEWAY_HINT_HEADERS=1 开启。 → 你使用 Claude Code 客户端 + mimo 第三方模型后端，这些请求头恰好作用在客户端与网关之间的链路上，属于你高优先级关注的 Agent 可观测性、上下文压缩管理与模型路由交叉点。
2. **Claude Code v2.1.271 增加 Remote 会话快速模式与全屏配置鼠标支持**
   Claude Code v2.1.271 为 Remote 会话（云端与自托管 runner）加入快速模式，由 host 端设置或会话中输入的 /fast 生效（受组织策略限制）；同时全屏模式下 /config 面板支持鼠标滚轮滚动。 → 属于你主力工具的工作流与交互效率变化，快速模式会影响会话响应行为与运行成本，是需要知情的客户端行为变更。

**🔧 主力工具状态**
• **codex**：本期无重要更新
• **claude-code**：v2.1.271~v2.1.273 三连发：网关提示请求头（工具耗时/上下文压缩元数据）、Remote 会话快速模式、以及 272 的可靠性修复，主线围绕可观测性与工作流效率

**📎 查看完整报告**
• https://1535385491.github.io/Opportunity-Radar/#2026-09-16/ai-personal