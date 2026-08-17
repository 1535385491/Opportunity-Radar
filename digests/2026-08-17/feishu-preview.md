# 飞书卡片预览 — 2026-08-17

以下内容将发送到飞书群：

**📋 五分钟概览**
1. **Claude Code v2.1.233 发布：新增 GitLab MR 支持及用户身份转发**
   Claude Code v2.1.233 新增了对 GitLab 合并请求 (MR) 的支持，并为网关模式引入了用户身份转发功能。 → 直接扩展了你所使用的 Claude Code 工具的工作流，特别是在基于 GitLab 的项目协作和代理/网关场景下的身份管理能力。
2. **Claude Code v2.1.229 发布：增强 Remote Control 可恢复性与服务器钩子支持**
   Claude Code v2.1.229 增加了 Remote Control 会话恢复的文档，为自托管运行器添加了服务器端钩子支持，并优化了网关流响应。 → 增强了工作流的可恢复性，并提升了 Claude Code 在企业或自托管环境中的集成能力。
3. **Claude Code v2.1.232 发布：子代理 Fork 默认开启及会话间提及**
   Claude Code v2.1.232 将子代理的 Fork 模式设为默认，并引入了通过 `@` 符号在会话间提及和交互的能力。 → 这是一项重大行为变更，直接增强了 Claude Code 的并行处理和会话间协作能力，影响日常交互和工作流设计。
4. **Claude Code v2.1.231 修复：MCP OAuth 登录重定向 URI 不匹配问题**
   Claude Code v2.1.231 修复了在使用预注册 OAuth 客户端（如 Slack）时，MCP OAuth 登录因重定向 URI 不匹配而失败的问题。 → 直接修复了影响 MCP 工具调用可靠性的关键问题。MCP 是你关注的工具调用可靠性的重要环节。

**🔧 主力工具状态**
• **codex**：本期无直接更新
• **claude-code**：本期发布多个重要版本，涵盖工作流扩展、代理交互增强及MCP可靠性修复。

**📎 查看完整报告**
• https://1535385491.github.io/Opportunity-Radar/#2026-08-17/ai-personal