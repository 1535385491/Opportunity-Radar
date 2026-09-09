# 飞书卡片预览 — 2026-09-09

以下内容将发送到飞书群：

**📋 五分钟概览**
1. **Claude Code v2.1.266 修复 LLM-gateway/proxy 配置回归**
   Claude Code v2.1.266 修复了 v2.1.265 引入的回归问题：`CLAUDE_CODE_USE_GATEWAY` 环境变量在未同时设置 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN` 时，会强制要求 Cloud-gateway 登录。 → 你实际使用 mimo 作为模型后端，很可能通过代理或 gateway 方式接入 Claude Code，此修复直接影响你的接入稳定性和工作流可靠性。
2. **临床 AI 系统与医生及前沿语言模型在初级诊疗中的对比研究**
   一项新研究对比了临床 AI 系统 Doctorina、8 名医生和 4 个前沿语言模型在 150 个波兰语初级诊疗模拟案例中的表现，Doctorina 实现了 82.0% 的 Top-1 一致性，研究强调应同时评估诊断和管理建议。 → 研究主要提供评测方法框架（自适信息采集后的诊断与管理评估），与你的智能诊断项目高度相关，可作为评测设计的参考。

**🔧 主力工具状态**
• **codex**：本期无重要更新
• **claude-code**：v2.1.266 修复了 2.1.265 引入的 LLM-gateway/proxy 配置回归问题，影响使用第三方后端的用户

**📎 查看完整报告**
• https://1535385491.github.io/Opportunity-Radar/#2026-09-09/ai-personal