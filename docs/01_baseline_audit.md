# agents-radar 基线审计文档

> 审计日期: 2026-07-12
> 审计范围: 项目获取、基线验证、现状审查（不含功能改造）
> 审计人: Claude (自动化审查)

---

## 1. 项目基本信息

| 项目 | 值 |
|------|-----|
| 名称 | agents-radar |
| 版本 | 1.0.0 |
| 作者 | duanyytop |
| 仓库 | https://github.com/duanyytop/agents-radar |
| 许可证 | 未在 package.json 中声明 |
| 描述 | 每日 AI 生态简报生成器，聚合 10+ 数据源，中英双语输出 |
| 模块类型 | ESM (`"type": "module"`) |
| 包管理器 | pnpm@9.15.9 (corepack 兼容) |

---

## 2. 当前 Git 状态

| 项目 | 值 |
|------|-----|
| 当前分支 | `master` |
| 最新提交 | `af0f772 chore: update manifest.json` |
| 工作区 | 干净（无未提交修改） |
| origin | `https://github.com/duanyytop/agents-radar.git`（原作者仓库，非 Fork） |

⚠️ **风险**: origin 直接指向原作者仓库。如果后续需要推送，应先 Fork 并修改 remote。

---

## 3. 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | v24.15.0 |
| 包管理 | pnpm | 9.15.9 |
| 语言 | TypeScript | ^5.7.0 (实际 5.9.3) |
| 运行方式 | tsx (直接执行 TS) | ^4.19.0 (实际 4.21.0) |
| 测试 | Vitest | ^4.0.18 |
| Lint | ESLint (flat config) | ^9 (实际 9.39.3) |
| 格式化 | Prettier | ^3 (实际 3.8.1) |
| Git Hooks | Husky | ^9.1.7 |
| LLM SDK | @anthropic-ai/sdk | ^0.78.0 |
| LLM SDK | openai | ^6.27.0 |
| YAML | js-yaml | ^4.1.1 |
| Markdown | marked | ^17.0.4 |
| 环境变量 | dotenv | ^17.3.1 |

**注意**: 没有 `build` 脚本。项目使用 `tsx` 直接运行 TypeScript，无需编译步骤。`pnpm start` 等同于 `tsx src/index.ts`。

---

## 4. 目录结构

```
agents-radar/
├── .github/workflows/     # CI + 定时任务工作流
│   ├── ci.yml              # push/PR 触发: lint + format:check + typecheck + test
│   ├── daily-digest.yml    # 每日 00:00 UTC: pnpm start
│   ├── weekly-digest.yml   # 每周一 01:00 UTC: pnpm weekly
│   └── monthly-digest.yml  # 每月 1 日 02:00 UTC: pnpm monthly
├── config.yml              # 可配置的追踪仓库列表
├── digests/                # 历史日报输出目录 + web-state.json
├── docs/                   # (新建) 审计文档
├── src/
│   ├── index.ts            # 主入口: fetchAllData → generateSummaries → comparisons → save
│   ├── config.ts           # 从 config.yml 加载仓库配置
│   ├── i18n.ts             # 集中化双语字符串
│   ├── date.ts             # 日期工具 (CST 转换、sleep)
│   ├── github.ts           # GitHub API 封装 (fetch issues/PRs/releases, createIssue)
│   ├── trending.ts         # GitHub Trending HTML 抓取 + Search API
│   ├── hn.ts               # Hacker News Algolia API
│   ├── ph.ts               # Product Hunt GraphQL API
│   ├── arxiv.ts            # ArXiv API (Atom feed)
│   ├── hf.ts               # Hugging Face Hub API
│   ├── devto.ts            # Dev.to Forem API
│   ├── lobsters.ts         # Lobste.rs JSON API
│   ├── web.ts              # Sitemap 抓取 + 内容提取 (Anthropic + OpenAI)
│   ├── prompts.ts          # LLM 提示词构建器 (仓库级)
│   ├── prompts-data.ts     # LLM 提示词构建器 (数据源级)
│   ├── report.ts           # callLlm (并发限制+重试)、saveFile、autoGenFooter
│   ├── report-builders.ts  # 组装最终 Markdown (CLI + OpenClaw)
│   ├── report-savers.ts    # 各报告的 LLM 调用 + 文件保存 + GitHub Issue
│   ├── rollup.ts           # 周报/月报生成器
│   ├── notify.ts           # Telegram 通知
│   ├── feishu.ts           # 飞书通知
│   ├── generate-manifest.ts# manifest.json + feed.xml 生成
│   ├── close-stale-issues.ts# 关闭过期 GitHub Issues
│   ├── social.ts           # 小红书/微信公众号 (social media)
│   ├── weekly.ts           # 周报入口
│   ├── monthly.ts          # 月报入口
│   └── providers/
│       ├── types.ts        # LlmProvider 接口
│       ├── anthropic.ts    # Anthropic SDK 封装
│       ├── openai.ts       # OpenAI SDK 封装
│       ├── openai-compatible.ts # OpenAI 兼容基类
│       ├── github-copilot.ts    # GitHub Copilot 封装
│       ├── openrouter.ts   # OpenRouter 封装
│       ├── deepseek.ts     # DeepSeek 封装
│       └── index.ts        # Provider 工厂 + barrel exports
├── mcp/                    # MCP Server (Cloudflare Worker)
├── index.html              # Web UI (GitHub Pages)
├── manifest.json           # 侧边栏数据
├── feed.xml                # RSS 2.0 Feed
└── package.json
```

---

## 5. 每日任务调用链

### 5.1 主入口: `pnpm start` → `tsx src/index.ts`

```
main()
│
├── requireEnv("GITHUB_TOKEN")              // 必须有 GitHub Token
│
├── Phase 1: fetchAllData(since, webState)   // 并行获取所有数据
│   ├── GitHub API: 22+ repos (issues/PRs/releases)
│   ├── Claude Code Skills: anthropics/skills
│   ├── Web: Anthropic + OpenAI sitemaps
│   ├── GitHub Trending: HTML 抓取 + Search API (6 topics)
│   ├── Hacker News: Algolia API (6 queries)
│   ├── Product Hunt: GraphQL API (需 PRODUCTHUNT_TOKEN)
│   ├── ArXiv: Atom API (cs.AI, cs.CL, cs.LG)
│   ├── Hugging Face: Hub API (top 30 models)
│   ├── Dev.to: Forem API (5 tags)
│   └── Lobste.rs: JSON API (ai + ml tags)
│
├── Phase 2: generateSummaries()             // 并行 LLM 调用 (ZH + EN 同时)
│   ├── 9 个 CLI 工具各自的摘要
│   ├── OpenClaw 深度报告
│   ├── Claude Code Skills 摘要
│   ├── 12 个 Peer 项目摘要
│   └── GitHub Trending 摘要
│
├── Phase 3: Comparisons                     // 4 次 LLM 调用
│   ├── CLI 横向对比 (ZH + EN)
│   └── OpenClaw 生态对比 (ZH + EN)
│
├── Phase 4: Save                            // 保存所有报告
│   ├── saveFile: ai-cli.md / ai-cli-en.md
│   ├── saveFile: ai-agents.md / ai-agents-en.md
│   ├── saveWebReport: ai-web.md / ai-web-en.md (有新内容时)
│   ├── saveTrendingReport: ai-trending.md / ai-trending-en.md
│   ├── saveHnReport: ai-hn.md / ai-hn-en.md
│   ├── savePhReport: ai-ph.md / ai-ph-en.md
│   ├── saveArxivReport: ai-arxiv.md / ai-arxiv-en.md
│   ├── saveHfReport: ai-hf.md / ai-hf-en.md
│   ├── saveCommunityReport: ai-community.md / ai-community-en.md
│   ├── saveFile: highlights.json (LLM 生成通知摘要)
│   └── createGitHubIssue: CLI + OpenClaw Issues (需 DIGEST_REPO)
│
└── Done
```

### 5.2 其他入口

| 命令 | 入口文件 | 功能 |
|------|---------|------|
| `pnpm weekly` | `src/weekly.ts` → `rollup.ts:runWeeklyRollup()` | 读取近 7 天日报，LLM 生成周报 |
| `pnpm monthly` | `src/monthly.ts` → `rollup.ts:runMonthlyRollup()` | 读取月内周报/日报，LLM 生成月报 |
| `pnpm notify` | `src/notify.ts` | 发送 Telegram 通知 |
| `pnpm notify:feishu` | `src/feishu.ts` | 发送飞书通知 |
| `pnpm manifest` | `src/generate-manifest.ts` | 生成 manifest.json + feed.xml |
| `pnpm close-stale` | `src/close-stale-issues.ts` | 关闭过期 Issues |

---

## 6. 数据源列表

| # | 数据源 | 模块 | 是否需要 API Key | 认证方式 |
|---|--------|------|-----------------|---------|
| 1 | GitHub Issues/PRs/Releases (22+ repos) | `github.ts` | 需要 `GITHUB_TOKEN` | Bearer Token |
| 2 | Claude Code Skills | `github.ts` | 同上 | Bearer Token |
| 3 | GitHub Trending (HTML) | `trending.ts` | 不需要 | 公开网页 |
| 4 | GitHub Search API (6 topics) | `trending.ts` | 可选（无 Token 有速率限制） | Bearer Token |
| 5 | Hacker News | `hn.ts` | 不需要 | 公开 API (Algolia) |
| 6 | Product Hunt | `ph.ts` | 需要 `PRODUCTHUNT_TOKEN` | Bearer Token |
| 7 | ArXiv | `arxiv.ts` | 不需要 | 公开 API |
| 8 | Hugging Face | `hf.ts` | 不需要 | 公开 API |
| 9 | Dev.to | `devto.ts` | 不需要 | 公开 API |
| 10 | Lobste.rs | `lobsters.ts` | 不需要 | 公开 JSON API |
| 11 | Anthropic 官网 | `web.ts` | 不需要 | Sitemap + HTML |
| 12 | OpenAI 官网 | `web.ts` | 不需要 | Sitemap (metadata-only) |

**关键发现**: 10 个数据源中有 6 个不需要任何 API Key 即可获取数据（GitHub Trending HTML、HN、ArXiv、HF、Dev.to、Lobste.rs）。

---

## 7. LLM 提供商

| 提供商 | Provider 类 | 默认模型 | 必需环境变量 |
|--------|------------|---------|------------|
| Anthropic (默认) | `AnthropicProvider` | claude-sonnet-4-6 | `ANTHROPIC_API_KEY` |
| OpenAI | `OpenAIProvider` | gpt-4o | `OPENAI_API_KEY` |
| GitHub Copilot | `GitHubCopilotProvider` | gpt-4o | `GITHUB_TOKEN` |
| OpenRouter | `OpenRouterProvider` | anthropic/claude-sonnet-4 | `OPENROUTER_API_KEY` |
| DeepSeek | `DeepSeekProvider` | deepseek-chat | `DEEPSEEK_API_KEY` |

所有 Provider 实现 `LlmProvider` 接口: `{ name: string, call(prompt, maxTokens): Promise<string> }`

LLM 并发限制: 5 个同时请求（`LLM_CONCURRENCY = 5`）
重试策略: 429 错误最多重试 3 次，指数退避 (5s → 10s → 20s)

---

## 8. 输出方式

### 8.1 文件输出

| 操作 | 函数 | 位置 | 说明 |
|------|------|------|------|
| 写入日报 | `saveFile()` | `digests/YYYY-MM-DD/*.md` | 每种报告 ZH + EN 各一个文件 |
| 写入状态 | `saveWebState()` | `digests/web-state.json` | Web URL 增量状态 |
| 写入通知摘要 | `saveFile()` | `digests/YYYY-MM-DD/highlights.json` | LLM 生成的标题摘要 |
| 写入 manifest | `generate-manifest.ts` | `manifest.json` + `feed.xml` | Web UI + RSS |

### 8.2 远程写操作

| 操作 | 函数 | 条件 | 影响 |
|------|------|------|------|
| 创建 GitHub Issue | `createGitHubIssue()` | `DIGEST_REPO` 有值 | 在 DIGEST_REPO 创建 Issue |
| 创建/确保 Label | `ensureLabel()` | 同上 | POST 创建 label（422 已存在则忽略） |
| 关闭过期 Issue | `closeStaleIssues()` | `DIGEST_REPO` 有值 | PATCH 关闭旧 Issue |
| Git 提交 + 推送 | GitHub Actions workflow | GHA 环境 | `git commit + push` 到 origin |
| Telegram 通知 | `sendTelegram()` | `TELEGRAM_BOT_TOKEN` 有值 | POST 到 Telegram API |
| 飞书通知 | `sendFeishu()` | `FEISHU_WEBHOOK_URLS` 有值 | POST 到飞书 Webhook |

---

## 9. 外部写操作风险

### 9.1 直接运行 `pnpm start` 时

| 风险等级 | 操作 | 触发条件 |
|---------|------|---------|
| 🔴 高 | 创建 GitHub Issues | `DIGEST_REPO` 环境变量有值 |
| 🟡 中 | 修改 `digests/web-state.json` | 总是发生（Web 模块会更新状态） |
| 🟡 中 | 写入 `digests/YYYY-MM-DD/*.md` | 总是发生（本地文件） |
| 🟢 低 | 不会发生 Git push | 需要 GHA workflow 步骤 |

### 9.2 GitHub Actions workflow 中

| 步骤 | 操作 | 脚本 |
|------|------|------|
| "Commit digest files" | `git add digests/ && git commit && git push` | daily-digest.yml |
| "Commit manifest and feed" | `git add manifest.json feed.xml && git commit && git push` | daily-digest.yml |
| "Send Telegram notification" | `pnpm notify` | daily-digest.yml |
| "Send Feishu notification" | `pnpm notify:feishu` | daily-digest.yml |
| "Close stale issues" | `pnpm close-stale` | daily-digest.yml |

### 9.3 不会自动触发的写操作

- ❌ 不会自动发送飞书消息（需 `FEISHU_WEBHOOK_URLS`）
- ❌ 不会自动发送 Telegram 消息（需 `TELEGRAM_BOT_TOKEN`）
- ❌ 不会自动创建 Issue（需 `DIGEST_REPO`）
- ✅ **总是会写入本地文件**（`digests/` 目录）
- ✅ **总是会更新 web-state.json**（如果 Web 模块运行）

---

## 10. 必需与可选 Secret

### 10.1 运行 `pnpm start` 的最小配置

| Secret | 必需? | 说明 |
|--------|-------|------|
| `GITHUB_TOKEN` | **必需** | main() 第一行 `requireEnv("GITHUB_TOKEN")` 会抛错 |
| `LLM_PROVIDER` + 对应 Key | **必需** | 所有报告生成都依赖 LLM 调用 |

### 10.2 按功能模块分类

| Secret | 模块 | 可选? | 缺失时行为 |
|--------|------|-------|-----------|
| `GITHUB_TOKEN` | github.ts, trending.ts | **必需** | main() 抛错 |
| `ANTHROPIC_API_KEY` | providers/anthropic.ts | 按 Provider | Anthropic provider 初始化失败 |
| `OPENAI_API_KEY` | providers/openai.ts | 按 Provider | OpenAI provider 初始化失败 |
| `DEEPSEEK_API_KEY` | providers/deepseek.ts | 按 Provider | DeepSeek provider 初始化失败 |
| `OPENROUTER_API_KEY` | providers/openrouter.ts | 按 Provider | OpenRouter provider 初始化失败 |
| `DIGEST_REPO` | github.ts (createIssue) | 可选 | 不创建 Issue，仅写本地文件 |
| `PRODUCTHUNT_TOKEN` | ph.ts | 可选 | 跳过 Product Hunt 数据获取 |
| `TELEGRAM_BOT_TOKEN` | notify.ts | 可选 | 跳过 Telegram 通知 |
| `TELEGRAM_CHAT_ID` | notify.ts | 可选 | 使用默认 @agents_radar |
| `FEISHU_WEBHOOK_URLS` | feishu.ts | 可选 | 跳过飞书通知 |

### 10.3 生产环境 (GitHub Actions) 使用的 Secrets

从 daily-digest.yml 分析:
- `GITHUB_TOKEN` (自动提供)
- `DEEPSEEK_API_KEY` (当前生产环境使用 DeepSeek 作为 LLM)
- `PRODUCTHUNT_TOKEN`
- `DIGEST_REPO` = `${{ github.repository }}`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `FEISHU_WEBHOOK_URLS`

---

## 11. 测试/类型检查/Lint/构建结果

| 命令 | 结果 | 详情 |
|------|------|------|
| `pnpm install --frozen-lockfile` | ✅ 通过 | 177 packages, 10.6s |
| `pnpm test` | ⚠️ 200/203 通过 | 3 个 saveFile 测试因 Windows 路径分隔符 (`\` vs `/`) 失败，属于平台问题，非项目 bug |
| `pnpm lint` | ✅ 通过 | 无 ESLint 错误 |
| `pnpm typecheck` | ✅ 通过 | 无 TypeScript 类型错误 |
| `pnpm format:check` | ❌ 失败 | 46 个文件有格式差异（已存在于仓库中，非本次引入） |
| `pnpm build` | N/A | 无 build 脚本，使用 tsx 直接执行 |

### 测试覆盖的模块

| 测试文件 | 覆盖模块 | 测试数 |
|---------|---------|-------|
| `config.test.ts` | config.ts (loadConfig) | 9 |
| `i18n.test.ts` | i18n.ts (双语字符串完整性) | 30 |
| `prompts.test.ts` | prompts.ts (prompt 构建器) | 18 |
| `prompt-builders.test.ts` | prompts-data.ts (数据源 prompt) | 22 |
| `providers.test.ts` | providers/*.ts (所有 5 个 Provider) | 31 |
| `report.test.ts` | report.ts (is429, callLlm, saveFile, parseLlmJson) | 28 |
| `report-builders.test.ts` | report-builders.ts | 5 |
| `notify.test.ts` | notify.ts (Telegram 消息构建) | 10 |
| `feishu.test.ts` | feishu.ts (飞书消息构建) | 9 |
| `web.test.ts` | web.ts (sitemap 解析, HTML 提取) | 26 |
| `generate-manifest.test.ts` | generate-manifest.ts | 10 |
| `rollup.test.ts` | rollup.ts (toWeekStr) | 5 |
| **总计** | | **203** |

### 未覆盖的核心模块

- `index.ts` (主入口/编排逻辑) — **无测试**
- `github.ts` (GitHub API 调用) — **无测试**
- `trending.ts` (Trending 抓取) — **无测试**
- `hn.ts` (HN 数据获取) — **无测试**
- `ph.ts` (Product Hunt) — **无测试**
- `arxiv.ts` (ArXiv) — **无测试**
- `hf.ts` (Hugging Face) — **无测试**
- `devto.ts` (Dev.to) — **无测试**
- `lobsters.ts` (Lobste.rs) — **无测试**
- `report-savers.ts` (报告保存+Issue 创建) — **无测试**

**测试策略总结**: 项目侧重测试"纯逻辑"模块（配置、i18n、prompt 构建、provider 接口、JSON 解析），但所有"副作用"模块（网络 I/O、文件写入、GitHub Issue 创建）均无测试。

---

## 12. 本地安全运行方案

### 12.1 当前不存在 dry-run 模式

项目 **没有内置 dry-run**。`main()` 在启动后会立即:
1. 调用 `requireEnv("GITHUB_TOKEN")` — 没有 Token 会直接抛错
2. 并行发起 50+ 个 GitHub API 请求
3. 调用 LLM 生成摘要
4. 写入本地文件
5. 如果 `DIGEST_REPO` 有值，创建 GitHub Issues

### 12.2 最小安全运行方案（不触发远程写操作）

```
环境变量设置:
  GITHUB_TOKEN=ghp_xxx          # 必须有，用于 API 读取
  LLM_PROVIDER=deepseek         # 或其他 provider
  DEEPSEEK_API_KEY=sk-xxx       # 对应 provider 的 key
  # 不设置 DIGEST_REPO          # 关键: 留空则不会创建 Issue
  # 不设置 TELEGRAM_*           # 跳过 Telegram
  # 不设置 FEISHU_*             # 跳过飞书
```

**效果**:
- ✅ 会获取公开数据（GitHub API、HN、ArXiv、HF 等）
- ✅ 会调用 LLM 生成摘要
- ✅ 会写入 `digests/YYYY-MM-DD/*.md` 本地文件
- ✅ 会更新 `digests/web-state.json`
- ❌ 不会创建 GitHub Issue
- ❌ 不会发送通知
- ❌ 不会 git commit/push

### 12.3 如果完全没有 LLM Key

无法运行完整 pipeline。但可以:
1. **只运行数据获取阶段** — 需要改造代码（拆分 fetchAllData 和后续阶段）
2. **运行测试** — `pnpm test` 不需要任何外部 Key（所有 SDK 都被 mock）
3. **运行 lint/typecheck** — 纯本地检查

### 12.4 建议的 dry-run 改造方向（本轮不实现）

未来可在 `main()` 入口增加 `DRY_RUN=true` 环境变量检查:
- 跳过 LLM 调用（使用占位文本）
- 跳过 GitHub Issue 创建
- 跳过通知发送
- 仅写入原始数据到本地文件

---

## 13. 后续改造预计涉及的文件

基于"个人机会雷达"的改造目标，以下文件最可能需要修改:

### 必须修改

| 文件 | 原因 |
|------|------|
| `src/index.ts` | 主编排逻辑需要重构：新的数据源、新的筛选逻辑、新的输出格式 |
| `config.yml` | 追踪的仓库/数据源列表需要完全替换 |
| `src/i18n.ts` | 报告标题、标签、通知文案需要改为"机会雷达"风格 |
| `src/prompts-data.ts` | LLM prompt 需要改为"机会筛选"视角 |
| `src/prompts.ts` | 如果保留仓库级报告，prompt 也需要调整 |
| `src/report-savers.ts` | 输出格式可能需要改（飞书卡片 vs GitHub Issue） |
| `src/report-builders.ts` | Markdown 结构需要改为"机会卡片"格式 |

### 可能修改

| 文件 | 原因 |
|------|------|
| `src/notify.ts` | 如果用飞书替代 Telegram 作为主推送渠道 |
| `src/feishu.ts` | 飞书消息格式可能需要改造为"机会卡片" |
| `src/github.ts` | 如果不需要创建 Issue，可简化 |
| `src/web.ts` | 如果需要追踪更多官网内容 |
| `src/trending.ts` | 可能保留用于发现新项目 |
| `src/hn.ts` | 可能保留用于发现热门话题 |
| `src/report.ts` | callLlm 并发限制可能需要调整 |
| `src/config.ts` | 配置结构可能需要扩展 |
| `.github/workflows/daily-digest.yml` | 调度频率、环境变量可能需要调整 |
| `manifest.json` / `index.html` | Web UI 可能需要改造或移除 |

### 可能新增

| 文件 | 原因 |
|------|------|
| `src/opportunity-filter.ts` | 机会筛选逻辑（LLM 判断是否与大学生相关） |
| `src/opportunity-card.ts` | 机会卡片格式化（为什么有关、商业化可能、风险、下一步） |
| `src/sources/*.ts` | 新数据源（如果需要添加 Product Hunt 之外的来源） |

### 大概率不需要修改

| 文件 | 原因 |
|------|------|
| `src/providers/*.ts` | LLM Provider 抽象层设计良好，无需改动 |
| `src/date.ts` | 日期工具函数通用 |
| `src/devto.ts` / `src/lobsters.ts` | 如果需要保留社区数据源 |

---

## 14. 已知问题

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | 3 个 saveFile 测试在 Windows 上失败 | 低 | 路径分隔符问题 (`/` vs `\`)，CI 运行在 Linux 上无此问题 |
| 2 | 46 个文件未通过 Prettier 格式检查 | 低 | 已存在于仓库中，非本次引入。不影响功能 |
| 3 | 无 dry-run 模式 | 中 | 无法在不产生副作用的情况下观察 pipeline 行为 |
| 4 | 核心 I/O 模块无测试 | 中 | github.ts、数据源模块、report-savers.ts 均无单元测试 |
| 5 | 无 LICENSE 文件 | 低 | package.json 中也未声明 license |
| 6 | web-state.json 依赖文件系统状态 | 低 | 首次运行与后续运行行为不同（首次抓取更多文章） |
| 7 | origin 指向原作者仓库 | 高 | 推送操作会直接影响原仓库（本次未修改 remote） |

---

## 15. 下一阶段建议

### 15.1 接管前准备

1. **Fork 仓库** — 将 origin 改为自己的 Fork，避免影响原作者
2. **创建 .env 文件** — 基于 `.env.example` 配置必要的 Token
3. **安全试运行** — 不设 `DIGEST_REPO`，确认只写本地文件

### 15.2 改造第一阶段建议

1. **添加 dry-run 模式** — 在 `main()` 入口增加 `DRY_RUN` 环境变量检查
2. **精简数据源** — 先从 2-3 个最相关的数据源开始（如 GitHub Trending + HN + ArXiv）
3. **改造 prompt** — 将"日报摘要"改为"机会筛选"
4. **改造输出格式** — 从长篇报告改为 3-5 条精简机会卡片
5. **替换通知渠道** — 从 Telegram 为主改为飞书为主

### 15.3 架构优势（可直接复用的部分）

- ✅ LLM Provider 抽象层设计优秀，支持 5 个 Provider 无缝切换
- ✅ 并发限制 + 重试机制成熟（`callLlm` + `LLM_CONCURRENCY`）
- ✅ 双语支持架构清晰（`i18n.ts` + `Lang` 类型）
- ✅ 配置外部化（`config.yml` + `config.ts`）
- ✅ 数据源模块化良好，每个数据源独立一个文件
- ✅ 测试框架完整（Vitest + mock），扩展测试覆盖方便

---

## 附录 A: 完整源文件清单

共 34 个 TypeScript 源文件 + 12 个测试文件:

**核心编排**: index.ts, weekly.ts, monthly.ts
**数据获取**: github.ts, trending.ts, hn.ts, ph.ts, arxiv.ts, hf.ts, devto.ts, lobsters.ts, web.ts
**LLM 处理**: prompts.ts, prompts-data.ts, report.ts, report-builders.ts, report-savers.ts
**配置**: config.ts, i18n.ts, date.ts
**通知**: notify.ts, feishu.ts
**工具**: generate-manifest.ts, close-stale-issues.ts, social.ts, rollup.ts
**Provider**: providers/types.ts, providers/anthropic.ts, providers/openai.ts, providers/openai-compatible.ts, providers/github-copilot.ts, providers/openrouter.ts, providers/deepseek.ts, providers/index.ts

## 附录 B: GHA Workflow 依赖关系

```
daily-digest.yml (00:00 UTC daily)
  ├── pnpm install --frozen-lockfile
  ├── pnpm start                    # 需要: GITHUB_TOKEN, DEEPSEEK_API_KEY, PRODUCTHUNT_TOKEN, DIGEST_REPO
  ├── git commit + push (digests/)
  ├── pnpm manifest                 # 生成 manifest.json + feed.xml
  ├── git commit + push (manifest.json, feed.xml)
  ├── pnpm notify                   # 需要: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
  ├── pnpm notify:feishu            # 需要: FEISHU_WEBHOOK_URLS
  └── pnpm close-stale              # 需要: GITHUB_TOKEN, DIGEST_REPO

weekly-digest.yml (01:00 UTC Monday)
  ├── pnpm weekly                   # 需要: GITHUB_TOKEN, DEEPSEEK_API_KEY, DIGEST_REPO
  ├── git commit + push
  ├── pnpm manifest
  ├── git commit + push
  └── pnpm notify

monthly-digest.yml (02:00 UTC 1st of month)
  ├── pnpm monthly                  # 需要: GITHUB_TOKEN, DEEPSEEK_API_KEY, DIGEST_REPO
  ├── git commit + push
  ├── pnpm manifest
  ├── git commit + push
  └── pnpm notify

ci.yml (push to master / PR)
  ├── pnpm lint
  ├── pnpm format:check
  ├── pnpm typecheck
  └── pnpm test
```
