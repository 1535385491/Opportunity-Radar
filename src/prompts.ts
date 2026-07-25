/**
 * LLM prompt builders and item formatting.
 */

import type { RepoConfig, GitHubItem, GitHubRelease } from "./github.ts";
import type { Lang } from "./i18n.ts";

/** Tool IDs that get primary (deep) treatment in the topic-organized report. */
export const PRIMARY_TOOL_IDS = new Set(["claude-code", "codex"]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoDigest {
  config: RepoConfig;
  issues: GitHubItem[];
  prs: GitHubItem[];
  releases: GitHubRelease[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatItem(item: GitHubItem, lang: Lang = "zh"): string {
  const labels = item.labels.map((l) => l.name).join(", ");
  const labelStr = labels ? ` [${labels}]` : "";
  const body = (item.body ?? "").replace(/\n/g, " ").trim().slice(0, 300);
  const ellipsis = (item.body ?? "").length > 300 ? "..." : "";
  const t =
    lang === "en"
      ? {
          author: "Author",
          created: "Created",
          updated: "Updated",
          comments: "Comments",
          url: "URL",
          summary: "Summary",
        }
      : { author: "作者", created: "创建", updated: "更新", comments: "评论", url: "链接", summary: "摘要" };
  // Extract "owner/repo" from html_url to avoid full GitHub URLs that trigger cross-references
  const repoSlug = item.html_url.replace(/^https:\/\/github\.com\//, "").replace(/\/(issues|pull)\/\d+$/, "");
  const itemKind = item.html_url.includes("/pull/") ? "PR" : "Issue";
  const refStr = `${repoSlug} ${itemKind} #${item.number}`;
  return [
    `#${item.number} [${item.state.toUpperCase()}]${labelStr} ${item.title}`,
    `  ${t.author}: ${item.user.login} | ${t.created}: ${item.created_at.slice(0, 10)} | ${t.updated}: ${item.updated_at.slice(0, 10)} | ${t.comments}: ${item.comments} | 👍: ${item.reactions?.["+1"] ?? 0}`,
    `  ${t.url}: ${refStr}`,
    `  ${t.summary}: ${body}${ellipsis}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Sampling helpers (shared)
// ---------------------------------------------------------------------------

const CLI_ISSUE_LIMIT = 30;
const CLI_PR_LIMIT = 20;

/** Sort by comment count desc, take top N. */
export function topN(items: GitHubItem[], n: number): GitHubItem[] {
  return [...items].sort((a, b) => b.comments - a.comments).slice(0, n);
}

export function sampleNote(total: number, sampled: number, lang: Lang = "zh"): string {
  if (lang === "en") {
    return total > sampled
      ? `(Total: ${total} items; showing top ${sampled} by comment count)`
      : `(Total: ${total} items)`;
  }
  return total > sampled ? `（共 ${total} 条，以下展示评论数最多的 ${sampled} 条）` : `（共 ${total} 条）`;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function buildCliPrompt(
  cfg: RepoConfig,
  issues: GitHubItem[],
  prs: GitHubItem[],
  releases: GitHubRelease[],
  dateStr: string,
  lang: Lang = "zh",
): string {
  const sampledIssues = topN(issues, CLI_ISSUE_LIMIT);
  const sampledPrs = topN(prs, CLI_PR_LIMIT);

  const issuesText =
    sampledIssues.map((i) => formatItem(i, lang)).join("\n") || (lang === "en" ? "None" : "无");
  const prsText = sampledPrs.map((p) => formatItem(p, lang)).join("\n") || (lang === "en" ? "None" : "无");
  const releasesText = releases.length
    ? releases.map((r) => `- ${r.tag_name}: ${r.name}\n  ${(r.body ?? "").slice(0, 300)}`).join("\n")
    : lang === "en"
      ? "None"
      : "无";

  const issueNote = sampleNote(issues.length, sampledIssues.length, lang);
  const prNote = sampleNote(prs.length, sampledPrs.length, lang);

  if (lang === "en") {
    return `You are a technical analyst focused on AI developer tools. Based on the following GitHub data, generate the ${cfg.name} community digest for ${dateStr}.

# Data source: github.com/${cfg.repo}

## Latest Releases (last 24h)
${releasesText}

## Latest Issues (updated in last 24h)${issueNote}
${issuesText}

## Latest Pull Requests (updated in last 24h)${prNote}
${prsText}

---

Generate a structured English digest with the following sections:

1. **Today's Highlights** - 2-3 sentences summarizing the most important updates
2. **Releases** - If new versions exist, summarize changes and user impact; omit if none
3. **Hot Issues** - Pick 5 noteworthy Issues, each with: what it is → why it matters → user impact
4. **Key PR Progress** - Pick 5 important PRs, each with: what changed → what problem it solves → user impact
5. **Feature Request Trends** - Distill the most-requested feature directions from all Issues
6. **Developer Pain Points** - Summarize recurring developer frustrations or high-frequency requests

Filtering rules (strictly enforce — exclude these types):
- Company strategy / business news / market positioning / funding / acquisitions
- Internal community governance / disputes / namespace abuse discussions
- Pure UI details (button placement, placeholder text, copy-paste glitches)
- Project management / CI pipelines / CONTRIBUTING.md / release note automation
- Premature RFCs (discussion-only proposals with no concrete implementation)
- License / terms of service changes

Prioritize (surface prominently):
- Context management, session persistence, memory capabilities
- Agent/agentic capabilities, background tasks, multi-agent collaboration
- Code understanding and editing quality, AST awareness
- MCP/tool integration, protocol reliability
- Cost and performance (token consumption, latency, caching)
- New model real-world performance and adaptation issues
- Critical bugs and stability issues

Style: concise and professional, suited for technical developers. Include GitHub links for each item.
`;
  }

  return `你是一位专注于 AI 开发工具的技术分析师。请根据以下 GitHub 数据，生成 ${dateStr} 的 ${cfg.name} 社区动态日报。

# 数据来源: github.com/${cfg.repo}

## 最新 Releases（过去24小时）
${releasesText}

## 最新 Issues（过去24小时内更新）${issueNote}
${issuesText}

## 最新 Pull Requests（过去24小时内更新）${prNote}
${prsText}

---

请生成一份结构清晰的中文日报，包含以下部分：

1. **今日速览** - 用2-3句话概括今天最重要的动态
2. **版本发布** - 如有新版本，总结更新内容和对用户的影响；无则省略
3. **社区热点 Issues** - 挑选 5 个最值得关注的 Issue，每条说明：是什么 → 为什么重要 → 对用户的影响
4. **重要 PR 进展** - 挑选 5 个重要的 PR，每条说明：改了什么 → 解决什么问题 → 对用户的影响
5. **功能需求趋势** - 从所有 Issues 中提炼出社区最关注的功能方向
6. **开发者关注点** - 总结开发者反馈中的痛点或高频需求

过滤规则（严格遵守，以下类型不要出现在报告中）：
- 公司战略/商业新闻/市场定位/融资/收购
- 社区内部治理/争议/命名空间滥用讨论
- 纯 UI 细节（按钮位置、占位符文案、文本复制乱码等）
- 项目管理/CI 流程/CONTRIBUTING.md/发布说明自动化
- 无行动力的远期 RFC（仅讨论阶段、无具体实现的提案）
- 许可证/服务条款变更

重点关注（优先展示）：
- 上下文管理、会话持久化、记忆能力
- Agent/代理能力、后台任务、多代理协作
- 代码理解与编辑质量、AST 感知
- MCP/工具集成、协议可靠性
- 成本与性能（token 消耗、延迟、缓存）
- 新模型的实际表现和适配问题
- 重大 Bug 和稳定性问题

语言要求：简洁专业，适合技术开发者阅读。每个条目附上 GitHub 链接。
`;
}

const PEER_ISSUE_LIMIT = 30;
const PEER_PR_LIMIT = 20;

export function buildPeerPrompt(
  cfg: RepoConfig,
  issues: GitHubItem[],
  prs: GitHubItem[],
  releases: GitHubRelease[],
  dateStr: string,
  issueLimit = PEER_ISSUE_LIMIT,
  prLimit = PEER_PR_LIMIT,
  lang: Lang = "zh",
): string {
  const totalIssues = issues.length;
  const totalPrs = prs.length;

  const sampledIssues = topN(issues, issueLimit);
  const sampledPrs = topN(prs, prLimit);

  const noneStr = lang === "en" ? "None" : "无";
  const issuesText = sampledIssues.map((i) => formatItem(i, lang)).join("\n") || noneStr;
  const prsText = sampledPrs.map((p) => formatItem(p, lang)).join("\n") || noneStr;
  const releasesText = releases.length
    ? releases.map((r) => `- ${r.tag_name}: ${r.name}\n  ${(r.body ?? "").slice(0, 300)}`).join("\n")
    : noneStr;

  const openIssues = issues.filter((i) => i.state === "open").length;
  const closedIssues = issues.filter((i) => i.state === "closed").length;
  const openPrs = prs.filter((p) => p.state === "open").length;
  const mergedPrs = prs.filter((p) => p.state === "closed").length;

  const issueSampleNote = sampleNote(totalIssues, sampledIssues.length, lang);
  const prSampleNote = sampleNote(totalPrs, sampledPrs.length, lang);

  if (lang === "en") {
    return `You are an analyst of AI agent and personal AI assistant open-source projects. Based on the following GitHub data from ${cfg.name} (github.com/${cfg.repo}), generate a project digest for ${dateStr}.

# Data Overview
- Issues updated in last 24h: ${totalIssues} (open/active: ${openIssues}, closed: ${closedIssues})
- PRs updated in last 24h: ${totalPrs} (open: ${openPrs}, merged/closed: ${mergedPrs})
- New releases: ${releases.length}

## Latest Releases
${releasesText}

## Latest Issues ${issueSampleNote}
${issuesText}

## Latest Pull Requests ${prSampleNote}
${prsText}

---

Generate a structured English ${cfg.name} project digest with the following sections:

1. **Today's Overview** - 3-5 sentences summarizing project status, including activity assessment
2. **Releases** - If new versions exist, detail changes, breaking changes, migration notes; omit if none
3. **Project Progress** - Merged/closed PRs today, what features advanced or were fixed
4. **Community Hot Topics** - Most active Issues/PRs with most comments/reactions (with links), analyze underlying needs
5. **Bugs & Stability** - Bugs, crashes, regressions reported today, ranked by severity, note if fix PRs exist
6. **Feature Requests & Roadmap Signals** - User-requested features, predict which might be in next version
7. **User Feedback Summary** - Real user pain points, use cases, satisfaction/dissatisfaction
8. **Backlog Watch** - Long-unanswered important Issues or PRs needing maintainer attention

Style: objective, data-driven, highlighting project health. Include GitHub links for each item.
`;
  }

  return `你是一位 AI 智能体与个人 AI 助手领域开源项目分析师。请根据以下来自 ${cfg.name} (github.com/${cfg.repo}) 的 GitHub 数据，生成 ${dateStr} 的项目动态日报。

# 数据概览
- 过去24小时 Issues 更新：${totalIssues} 条（新开/活跃: ${openIssues}，已关闭: ${closedIssues}）
- 过去24小时 PR 更新：${totalPrs} 条（待合并: ${openPrs}，已合并/关闭: ${mergedPrs}）
- 新版本发布：${releases.length} 个

## 最新 Releases
${releasesText}

## 最新 Issues ${issueSampleNote}
${issuesText}

## 最新 Pull Requests ${prSampleNote}
${prsText}

---

请生成一份结构清晰的 ${cfg.name} 项目日报，包含以下部分：

1. **今日速览** - 用3-5句话概括项目今日整体状态，包括活跃度评估
2. **版本发布** - 如有新版本，详细说明更新内容、破坏性变更、迁移注意事项；无则省略
3. **项目进展** - 今日合并/关闭的重要 PR，说明推进了哪些功能或修复，项目整体向前迈进了多少
4. **社区热点** - 今日讨论最活跃、评论最多、反应最多的 Issues/PRs（附链接），分析背后的诉求
5. **Bug 与稳定性** - 今日报告的 Bug、崩溃、回归问题，按严重程度排列，标注是否已有 fix PR
6. **功能请求与路线图信号** - 用户提出的新功能需求，结合已有 PR 判断哪些可能被纳入下一版本
7. **用户反馈摘要** - 从 Issues 评论中提炼真实用户痛点、使用场景、满意/不满意的地方
8. **待处理积压** - 长期未响应的重要 Issue 或 PR，提醒维护者关注

语言要求：客观专业，数据驱动，突出项目健康度。每个条目附上 GitHub 链接。
`;
}

export function buildPeersComparisonPrompt(
  openclawDigest: RepoDigest,
  peerDigests: RepoDigest[],
  dateStr: string,
  lang: Lang = "zh",
): string {
  const noActivityStr = lang === "en" ? "No activity in the last 24 hours." : "过去24小时无活动。";

  const openclawSection =
    lang === "en"
      ? `## OpenClaw (core reference, github.com/${openclawDigest.config.repo})\n${openclawDigest.summary}`
      : `## OpenClaw（核心参照，github.com/${openclawDigest.config.repo}）\n${openclawDigest.summary}`;

  const peerSections = peerDigests
    .map((d) => {
      const hasData = d.issues.length || d.prs.length || d.releases.length;
      if (!hasData) return `## ${d.config.name} (github.com/${d.config.repo})\n${noActivityStr}`;
      return `## ${d.config.name} (github.com/${d.config.repo})\n${d.summary}`;
    })
    .join("\n\n---\n\n");

  if (lang === "en") {
    return `You are a senior analyst of the AI agent and personal AI assistant open-source ecosystem. The following are ${dateStr} community digest summaries for each project.

${openclawSection}

---

${peerSections}

---

Generate a cross-project comparison report in English with these sections:

1. **Ecosystem Overview** - 3-5 sentences on the overall personal AI assistant / agent open-source landscape
2. **Activity Comparison** - Table comparing Issues count, PR count, Release status, and health score for each project
3. **OpenClaw's Position** - Advantages vs peers, technical approach differences, community size comparison
4. **Shared Technical Focus Areas** - Requirements emerging across multiple projects (note which projects, specific needs)
5. **Differentiation Analysis** - Key differences in feature focus, target users, technical architecture
6. **Community Momentum & Maturity** - Activity tiers, which are rapidly iterating, which are stabilizing
7. **Trend Signals** - Industry trends extracted from community feedback, value for AI agent developers

Style: concise and professional, data-backed, suited for technical decision-makers and developers.
`;
  }

  return `你是一位专注于 AI 智能体与个人 AI 助手开源生态的资深技术分析师。以下是 ${dateStr} 各开源项目的社区动态摘要。

${openclawSection}

---

${peerSections}

---

请基于上述各项目的动态，生成一份横向对比分析报告，包含以下部分：

1. **生态全景** - 用3-5句话概括个人 AI 助手/自主智能体开源生态整体态势
2. **各项目活跃度对比** - 以表格形式汇总各项目今日的 Issues 数、PR 数、Release 情况及健康度评估
3. **OpenClaw 在生态中的定位** - 与同类相比的优势、技术路线差异、社区规模对比
4. **共同关注的技术方向** - 多项目共同涌现的需求（注明涉及哪些项目、具体诉求）
5. **差异化定位分析** - 功能侧重、目标用户、技术架构的关键差异
6. **社区热度与成熟度** - 活跃度分层，哪些处于快速迭代阶段，哪些在质量巩固阶段
7. **值得关注的趋势信号** - 从社区反馈中提炼行业趋势，对 AI 智能体开发者的参考价值

语言要求：简洁专业，有数据支撑，适合技术决策者和开发者阅读。
`;
}

export function buildSkillsPrompt(
  prs: GitHubItem[],
  issues: GitHubItem[],
  dateStr: string,
  lang: Lang = "zh",
): string {
  const topPrs = topN(prs, 20);
  const topIssues = topN(issues, 15);

  const noneStr = lang === "en" ? "None" : "无";
  const prsText = topPrs.map((p) => formatItem(p, lang)).join("\n") || noneStr;
  const issuesText = topIssues.map((i) => formatItem(i, lang)).join("\n") || noneStr;

  if (lang === "en") {
    return `You are a technical analyst focused on the Claude Code ecosystem. The following data is from github.com/anthropics/skills (official Claude Code Skills repository). Analyze the community's most-watched Skills activity (data as of ${dateStr}).

## Repository Context
anthropics/skills is the official Claude Code Skills collection. Each PR typically represents a new or improved Skill. The community proposes new Skills and reports issues via Issues; PRs represent actual Skill submissions.

## Popular Pull Requests (sorted by comments, ${prs.length} total, showing top ${topPrs.length})
${prsText}

## Community Issues (sorted by comments, ${issues.length} total, showing top ${topIssues.length})
${issuesText}

---

Generate a Claude Code Skills community highlights report in English with these sections:

1. **Top Skills Ranking** - List the 5-8 most-discussed Skills (PRs) by comments/attention, describe each Skill's functionality, discussion highlights, and current status (open/merged/draft)
2. **Community Demand Trends** - From Issues, distill the most-anticipated new Skill directions (e.g. workflow automation, code review, test generation, documentation)
3. **High-Potential Pending Skills** - Active-comment PRs not yet merged; these Skills may land soon
4. **Skills Ecosystem Insight** - One-sentence summary: what is the community's most concentrated demand at the Skills level?

Style: concise and professional, include GitHub links for each item.
`;
  }

  return `你是一位专注于 Claude Code 生态的技术分析师。以下是来自 github.com/anthropics/skills（Claude Code Skills 官方仓库）的数据，请分析社区最关注的 Skills 动态（数据截止 ${dateStr}）。

## 仓库说明
anthropics/skills 是 Claude Code 官方 Skills 集合仓库，每个 PR 通常对应一个新增或改进的 Skill。社区通过 Issues 提出新 Skill 需求或反馈问题，PR 则代表实际提交的 Skill。

## 热门 Pull Requests（按评论数排序，共 ${prs.length} 条，展示前 ${topPrs.length} 条）
${prsText}

## 社区 Issues（按评论数排序，共 ${issues.length} 条，展示前 ${topIssues.length} 条）
${issuesText}

---

请生成一份 Claude Code Skills 社区热点报告，包含以下部分：

1. **热门 Skills 排行** - 列出评论/关注度最高的 5~8 个 Skills（PR），说明每个 Skill 的功能、社区讨论热点及当前状态（open/merged/draft）
2. **社区需求趋势** - 从 Issues 中提炼社区最期待的新 Skill 方向（如工作流自动化、代码审查、测试生成、文档等）
3. **高潜力待合并 Skills** - 评论活跃但尚未合并的 PR，这些 Skills 可能近期落地
4. **Skills 生态洞察** - 一句话总结：当前社区在 Skills 层面最集中的诉求是什么

语言要求：简洁专业，每个条目附上 GitHub 链接。
`;
}

export function buildComparisonPrompt(digests: RepoDigest[], dateStr: string, lang: Lang = "zh"): string {
  const noActivityStr = lang === "en" ? "No activity in the last 24 hours." : "过去24小时无活动。";

  const sections = digests
    .map((d) => {
      const hasData = d.issues.length || d.prs.length || d.releases.length;
      if (!hasData) return `## ${d.config.name} (github.com/${d.config.repo})\n${noActivityStr}`;
      return `## ${d.config.name} (github.com/${d.config.repo})\n${d.summary}`;
    })
    .join("\n\n---\n\n");

  if (lang === "en") {
    return `You are a senior technical analyst of the AI developer tools ecosystem. The following are ${dateStr} community digest summaries for each major AI CLI tool:

${sections}

---

Generate a cross-tool signals report in English with these sections:

1. **Shared Signals** - Requirements or issues appearing across multiple tool communities (note which tools, specific needs). Omit if no clear cross-tool patterns exist.
2. **Emerging Technical Directions** - Frontier tech signals from community feedback, must be related to how developers actually use the tools (backed by concrete dynamics, not pure speculation).

Filtering rules: exclude company strategy/business news, community governance/disputes, pure UI details, project management/CI, premature RFCs.

Style: concise and professional, data-backed, suited for technical developers.
`;
  }

  return `你是一位专注于 AI 开发工具生态的资深技术分析师。以下是 ${dateStr} 各主流 AI CLI 工具的社区动态摘要：

${sections}

---

请基于上述各工具的动态，提炼跨工具共同关注的功能方向，包含以下部分：

1. **跨工具共同信号** - 多个工具社区同时出现的需求或问题（注明涉及哪些工具、具体诉求）。如果没有明显的共同信号，可以省略。
2. **新兴技术方向** - 从社区反馈中提炼的前沿技术信号，必须与开发者实际使用方式相关（有具体动态支撑，不是纯展望）

过滤规则：不要包含公司战略/商业新闻、社区治理/争议、纯 UI 细节、项目管理/CI 流程、远期 RFC。

语言要求：简洁专业，有数据支撑，适合技术开发者阅读。
`;
}

/**
 * Build a prompt that generates a topic-organized overview of all CLI tools.
 * Primary tools (Codex, Claude Code) get detailed treatment; secondary tools get one-liners.
 */
export function buildTopicComparisonPrompt(
  cliDigests: RepoDigest[],
  skillsSummary: string,
  dateStr: string,
  lang: Lang = "zh",
): string {
  const primaryDigests = cliDigests.filter((d) => PRIMARY_TOOL_IDS.has(d.config.id));
  const secondaryDigests = cliDigests.filter((d) => !PRIMARY_TOOL_IDS.has(d.config.id));

  const primarySections = primaryDigests
    .map((d) => {
      const skills =
        d.config.id === "claude-code" && skillsSummary
          ? `\n\n### Claude Code Skills 动态\n${skillsSummary}`
          : "";
      return `### ${d.config.name} (github.com/${d.config.repo})\n${d.summary}${skills}`;
    })
    .join("\n\n---\n\n");

  const secondarySections = secondaryDigests
    .map((d) => {
      const hasData = d.issues.length || d.prs.length || d.releases.length;
      if (!hasData) return `### ${d.config.name}\n过去24小时无活动。`;
      return `### ${d.config.name} (github.com/${d.config.repo})\n${d.summary}`;
    })
    .join("\n\n---\n\n");

  if (lang === "en") {
    return `You are a senior technical analyst of AI developer tools. Below are community digest summaries for ${dateStr}.

## Primary Tools (detailed)
${primarySections}

---

## Secondary Tools (summaries)
${secondarySections}

---

Generate a topic-organized overview report in English with these sections:

### Section 1: Today's Overview (3-5 items)
Pick the 3-5 most important dynamics across ALL tools. Each item is one sentence: what happened + why it matters. These serve as a table of contents — readers use them to decide which topics to expand.

### Section 2: Topic-Based Expansion
Group dynamics by topic (topics are NOT fixed — choose based on today's actual data). Possible topics include:
- New model support/performance
- Critical bugs / stability
- Context management / memory
- Agent capabilities / background tasks
- MCP / tool integration
- Cost and performance
- Workflow / IDE integration changes

For each topic:
- **Primary tools (Codex, Claude Code):** Detailed — what changed, why it matters, impact on users (3-5 items per tool per topic)
- **Secondary tools:** One sentence per tool that has relevant dynamics. Tools with nothing relevant to the topic are omitted. If a secondary tool has a breakthrough or high-value signal, give it slightly more detail.

Filtering rules (strictly exclude):
- Company strategy / business news / market positioning
- Community governance / disputes
- Pure UI details (button placement, placeholder text)
- Project management / CI pipelines
- Premetry RFCs with no concrete implementation
- License / ToS changes

Priority dimensions (always surface):
- Context management, session persistence, memory
- Agent/agentic capabilities, background tasks
- Code understanding quality, AST awareness
- MCP/tool integration reliability
- Cost and performance (tokens, latency, caching)
- New model real-world performance
- Critical bugs affecting users

Style: concise, professional, action-oriented. Every item must help the reader decide "does this affect me?"
`;
  }

  return `你是一位专注于 AI 开发工具的技术分析师。以下是 ${dateStr} 各主流 AI CLI 工具的社区动态摘要。

## 主力工具（详细）
${primarySections}

---

## 其他工具（摘要）
${secondarySections}

---

请基于上述各工具的动态，生成一份按主题组织的概览报告，包含以下两部分：

### 第一部分：今日概览（3-5 条）
跨所有工具精选今日最重要的 3-5 条动态。每条一句话：发生了什么 + 为什么值得关注。这是报告的索引入口，帮读者在 30 秒内决定展开哪些主题。

### 第二部分：按主题展开
根据今天的实际数据自行归纳主题（主题不固定）。可能的主题方向：
- 新模型支持/适配
- 重大 Bug / 稳定性问题
- 上下文管理 / 记忆能力
- Agent 代理能力 / 后台任务
- MCP / 工具集成
- 成本与性能
- 工作流 / IDE 集成变化

每个主题的格式：
- **主力工具（Codex、Claude Code）：** 详细展开，每条说明：更新了什么 → 为什么重要 → 对用户的影响（每个工具每主题 3-5 条）
- **其他工具：** 一句话概括有价值的动态。没动态的工具不出现。如果某个次要工具有突破性或高价值信号，可以稍微多给一些篇幅。

过滤规则（严格排除以下内容）：
- 公司战略/商业新闻/市场定位
- 社区治理/争议
- 纯 UI 细节（按钮位置、占位符文案）
- 项目管理/CI 流程
- 无行动力的远期 RFC
- 许可证/服务条款变更

重点关注维度（优先展示）：
- 上下文管理、会话持久化、记忆能力
- Agent/代理能力、后台任务、多代理协作
- 代码理解与编辑质量、AST 感知
- MCP/工具集成、协议可靠性
- 成本与性能（token 消耗、延迟、缓存）
- 新模型的实际表现和适配问题
- 重大 Bug 和稳定性问题

语言要求：简洁专业，有数据支撑，每条信息都要帮助读者判断"这跟我有没有关系"。
`;
}
