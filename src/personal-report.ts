/**
 * Personal report generation: candidate extraction, cross-source merge,
 * filtering, LLM-based topic organization, and Markdown rendering.
 *
 * This module replaces the per-source LLM report generation with a unified
 * pipeline: raw data → candidates → merge → single LLM call → JSON → Markdown.
 */

import type { RepoConfig, RepoFetch, GitHubItem, GitHubRelease } from "./github.ts";
import type { HnData } from "./hn.ts";
import type { WebFetchResult } from "./web.ts";
import type { TrendingData, TrendingSnapshot } from "./trending.ts";
import type { HfData, HfSnapshot } from "./hf.ts";
import type { PhData } from "./ph.ts";
import type { ArxivData } from "./arxiv.ts";
import type { DevtoData } from "./devto.ts";
import type { LobstersData } from "./lobsters.ts";
import type { PersonalReportConfig } from "./config.ts";
import type { Lang } from "./i18n.ts";
import { callLlm, parseLlmJson, saveFile, autoGenFooter } from "./report.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InfoType =
  | "release"
  | "pr"
  | "issue"
  | "paper"
  | "product"
  | "model"
  | "trend"
  | "article"
  | "discussion"
  | "skill";

export type TimeEvidence = "git-commit" | "api-date" | "url-date" | "snapshot" | "inferred";

export interface CandidateItem {
  /** Unique identifier (URL or generated hash). */
  id: string;
  /** Short descriptive title. */
  title: string;
  /** The project, tool, or entity this relates to. */
  subject: string;
  /** Brief factual description of what happened. */
  summary: string;
  /** ISO-8601 timestamp of the event. */
  eventTime: string;
  /** How the event time was determined. */
  timeEvidence: TimeEvidence;
  /** Source display name (e.g. "GitHub", "Hacker News"). */
  sourceName: string;
  /** Source URL for citation. */
  sourceUrl: string;
  /** Category of information. */
  infoType: InfoType;
  /** Whether this is from an official source. */
  officialConfirmed: boolean;
  /** Tags matching personal focus dimensions. */
  relevanceDimensions: string[];
  /** Raw data summary for LLM context. */
  rawSummary: string;
}

export interface MergedCandidate extends CandidateItem {
  /** Additional source URLs from merged duplicates. */
  additionalSources: string[];
}

export interface PersonalReportJson {
  generatedAt: string;
  coverageFrom: string;
  coverageTo: string;
  overview: Array<{ topic: string; summary: string }>;
  toolStatus: Record<string, string>;
  topics: Array<{
    name: string;
    items: Array<{
      title: string;
      what: string;
      why: string;
      impact: string;
      action?: string;
      status: "已确认" | "社区信号";
      sources: Array<{ name: string; url: string }>;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort by eventTime descending (newest first). */
function sortByTime(items: CandidateItem[]): CandidateItem[] {
  return [...items].sort((a, b) => b.eventTime.localeCompare(a.eventTime));
}

/** Truncate text to a max length. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

// ---------------------------------------------------------------------------
// Candidate Extraction: GitHub repos
// ---------------------------------------------------------------------------

function extractGitHubItemCandidates(
  items: GitHubItem[],
  cfg: RepoConfig,
  infoType: "issue" | "pr",
): CandidateItem[] {
  return items.map((item) => ({
    id: item.html_url,
    title: `#${item.number} ${item.title}`,
    subject: cfg.name,
    summary: truncate(item.body ?? "", 300),
    eventTime: item.updated_at ?? item.created_at ?? "",
    timeEvidence: "git-commit" as TimeEvidence,
    sourceName: "GitHub",
    sourceUrl: item.html_url,
    infoType,
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `State: ${item.state}, Comments: ${item.comments}, 👍: ${item.reactions?.["+1"] ?? 0}`,
  }));
}

function extractReleaseCandidates(
  releases: GitHubRelease[],
  cfg: RepoConfig,
): CandidateItem[] {
  return releases.map((r) => ({
    id: `release::${cfg.repo}::${r.tag_name}`,
    title: `${cfg.name} ${r.tag_name}`,
    subject: cfg.name,
    summary: truncate(r.body ?? r.name ?? "", 300),
    eventTime: r.published_at ?? "",
    timeEvidence: "git-commit" as TimeEvidence,
    sourceName: "GitHub",
    sourceUrl: `https://github.com/${cfg.repo}/releases/tag/${r.tag_name}`,
    infoType: "release",
    officialConfirmed: true,
    relevanceDimensions: [],
    rawSummary: `Tag: ${r.tag_name}, Name: ${r.name ?? ""}`,
  }));
}

export function extractRepoCandidates(
  fetch: RepoFetch,
  config: PersonalReportConfig,
  maxItems: number,
): CandidateItem[] {
  const isPrimary = config.primaryTools.includes(fetch.cfg.id);
  const limit = isPrimary ? 8 : Math.min(maxItems, 5);

  const issues = extractGitHubItemCandidates(fetch.issues, fetch.cfg, "issue");
  const prs = extractGitHubItemCandidates(fetch.prs, fetch.cfg, "pr");
  const releases = extractReleaseCandidates(fetch.releases, fetch.cfg);

  const all = sortByTime([...releases, ...issues, ...prs]);

  // For primary tools, take more; for others, only high-engagement items
  if (isPrimary) {
    return all.slice(0, limit);
  }
  // Secondary tools: prioritize releases and high-engagement items
  const highEngagement = all.filter(
    (c) => c.infoType === "release" || (c.rawSummary.includes("👍: ") && !c.rawSummary.includes("👍: 0")),
  );
  return (highEngagement.length > 0 ? highEngagement : all).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Candidate Extraction: HN
// ---------------------------------------------------------------------------

export function extractHnCandidates(data: HnData, maxItems = 5): CandidateItem[] {
  return sortByTime(
    data.stories.slice(0, maxItems).map((s) => ({
      id: s.hnUrl,
      title: s.title,
      subject: "Hacker News",
      summary: `${s.points} points, ${s.comments} comments`,
      eventTime: s.createdAt,
      timeEvidence: "api-date" as TimeEvidence,
      sourceName: "Hacker News",
      sourceUrl: s.url !== s.hnUrl ? s.url : s.hnUrl,
      infoType: "discussion" as InfoType,
      officialConfirmed: false,
      relevanceDimensions: [],
      rawSummary: `Points: ${s.points}, Comments: ${s.comments}, Author: ${s.author}`,
    })),
  );
}

// ---------------------------------------------------------------------------
// Candidate Extraction: Web (Anthropic/OpenAI)
// ---------------------------------------------------------------------------

export function extractWebCandidates(results: WebFetchResult[], maxItems = 5): CandidateItem[] {
  const items: CandidateItem[] = [];
  for (const result of results) {
    for (const page of result.newItems) {
      items.push({
        id: page.url,
        title: (page.title || page.url.split("/").pop()) ?? page.url,
        subject: result.siteName,
        summary: truncate(page.content || page.title, 300),
        eventTime: page.lastmod || new Date().toISOString(),
        timeEvidence: page.lastmod ? "url-date" : "inferred",
        sourceName: result.siteName,
        sourceUrl: page.url,
        infoType: "article",
        officialConfirmed: true,
        relevanceDimensions: [],
        rawSummary: `Category: ${page.category}, Site: ${result.siteName}`,
      });
    }
  }
  return sortByTime(items).slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// Candidate Extraction: Trending (snapshot-aware)
// ---------------------------------------------------------------------------

export function extractTrendingCandidates(
  data: TrendingData,
  maxItems = 5,
): CandidateItem[] {
  // trendingRepos are already filtered by the snapshot comparison in trending.ts
  const fromTrending = data.trendingRepos.map((r) => ({
    id: r.url,
    title: r.fullName,
    subject: r.fullName.split("/")[0] ?? r.fullName,
    summary: r.description || "No description",
    eventTime: new Date().toISOString(),
    timeEvidence: "snapshot" as TimeEvidence,
    sourceName: "GitHub Trending",
    sourceUrl: r.url,
    infoType: "trend" as InfoType,
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `Language: ${r.language}, Stars: ${r.totalStars.toLocaleString()}, Today: +${r.todayStars}`,
  }));

  // Search repos are not snapshot-filtered; take top by stars
  const fromSearch = data.searchRepos.slice(0, 3).map((r) => ({
    id: r.url,
    title: r.fullName,
    subject: r.fullName.split("/")[0] ?? r.fullName,
    summary: r.description || "No description",
    eventTime: r.pushedAt,
    timeEvidence: "api-date" as TimeEvidence,
    sourceName: `GitHub Search (${r.searchQuery})`,
    sourceUrl: r.url,
    infoType: "trend" as InfoType,
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `Stars: ${r.stargazersCount.toLocaleString()}, Query: ${r.searchQuery}`,
  }));

  return sortByTime([...fromTrending, ...fromSearch]).slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// Candidate Extraction: Hugging Face (snapshot-aware)
// ---------------------------------------------------------------------------

export function extractHfCandidates(data: HfData, maxItems = 5): CandidateItem[] {
  return data.models.slice(0, maxItems).map((m) => ({
    id: m.url,
    title: m.id,
    subject: m.author,
    summary: `Pipeline: ${m.pipelineTag || "N/A"}, Likes: ${m.likes.toLocaleString()}`,
    eventTime: m.lastModified || new Date().toISOString(),
    timeEvidence: "snapshot" as TimeEvidence,
    sourceName: "Hugging Face",
    sourceUrl: m.url,
    infoType: "model",
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `Likes: ${m.likes}, Downloads: ${m.downloads}, Tags: ${m.tags.slice(0, 5).join(", ")}`,
  }));
}

// ---------------------------------------------------------------------------
// Candidate Extraction: Product Hunt
// ---------------------------------------------------------------------------

export function extractPhCandidates(data: PhData, maxItems = 3): CandidateItem[] {
  return data.products.slice(0, maxItems).map((p) => ({
    id: p.url,
    title: p.name,
    subject: p.name,
    summary: p.tagline,
    eventTime: p.createdAt,
    timeEvidence: "api-date" as TimeEvidence,
    sourceName: "Product Hunt",
    sourceUrl: p.website || p.url,
    infoType: "product",
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `Votes: ${p.votesCount}, Comments: ${p.commentsCount}, Topics: ${p.topics.join(", ")}`,
  }));
}

// ---------------------------------------------------------------------------
// Candidate Extraction: ArXiv
// ---------------------------------------------------------------------------

export function extractArxivCandidates(data: ArxivData, maxItems = 5): CandidateItem[] {
  return data.papers.slice(0, maxItems).map((p) => ({
    id: p.url,
    title: p.title,
    subject: p.authors.slice(0, 3).join(", "),
    summary: truncate(p.summary, 300),
    eventTime: p.published,
    timeEvidence: "api-date" as TimeEvidence,
    sourceName: "ArXiv",
    sourceUrl: p.url,
    infoType: "paper",
    officialConfirmed: true,
    relevanceDimensions: [],
    rawSummary: `Categories: ${p.categories.join(", ")}, Authors: ${p.authors.length}`,
  }));
}

// ---------------------------------------------------------------------------
// Candidate Extraction: Community (Dev.to + Lobste.rs)
// ---------------------------------------------------------------------------

export function extractCommunityCandidates(
  devto: DevtoData,
  lobsters: LobstersData,
  maxItems = 3,
): CandidateItem[] {
  const devtoItems = devto.articles.slice(0, maxItems).map((a) => ({
    id: a.url,
    title: a.title,
    subject: a.user,
    summary: a.description,
    eventTime: a.publishedAt,
    timeEvidence: "api-date" as TimeEvidence,
    sourceName: "Dev.to",
    sourceUrl: a.url,
    infoType: "article" as InfoType,
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `Reactions: ${a.positiveReactionsCount}, Comments: ${a.commentsCount}, Tags: ${a.tags.join(", ")}`,
  }));

  const lobstersItems = lobsters.stories.slice(0, maxItems).map((s) => ({
    id: s.url,
    title: s.title,
    subject: s.author,
    summary: `${s.score} points, ${s.commentCount} comments`,
    eventTime: s.publishedAt,
    timeEvidence: "api-date" as TimeEvidence,
    sourceName: "Lobste.rs",
    sourceUrl: s.commentsUrl,
    infoType: "discussion" as InfoType,
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: `Score: ${s.score}, Comments: ${s.commentCount}, Tags: ${s.tags.join(", ")}`,
  }));

  return sortByTime([...devtoItems, ...lobstersItems]).slice(0, maxItems);
}

// ---------------------------------------------------------------------------
// Cross-source Merge (Task 6)
// ---------------------------------------------------------------------------

/**
 * Deterministic dedup: same URL, same GitHub issue/PR, same paper/model ID.
 * Returns merged candidates with additional sources preserved.
 */
export function mergeCandidates(candidates: CandidateItem[]): MergedCandidate[] {
  const byKey = new Map<string, MergedCandidate>();

  for (const c of candidates) {
    // Normalize the dedup key
    const key = normalizeUrl(c.sourceUrl) || c.id;

    const existing = byKey.get(key);
    if (existing) {
      // Merge: keep the richer item, add additional source
      if (c.sourceUrl !== existing.sourceUrl) {
        existing.additionalSources.push(c.sourceUrl);
      }
      // Prefer official-confirmed items
      if (c.officialConfirmed && !existing.officialConfirmed) {
        existing.officialConfirmed = true;
        existing.summary = c.summary;
      }
      // Merge relevance dimensions
      for (const dim of c.relevanceDimensions) {
        if (!existing.relevanceDimensions.includes(dim)) {
          existing.relevanceDimensions.push(dim);
        }
      }
    } else {
      byKey.set(key, { ...c, additionalSources: [] });
    }
  }

  return [...byKey.values()];
}

/**
 * Normalize URL for dedup: strip trailing slashes, fragments, common query params.
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return url;
  }
}

/**
 * Final selection: cap items, ensure no more than `limit`.
 */
export function selectFinalItems(
  merged: MergedCandidate[],
  limit: number,
): MergedCandidate[] {
  return merged.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Report Generation (Task 7)
// ---------------------------------------------------------------------------

const PERSONAL_REPORT_TOKENS = 8192;

/**
 * Builds the LLM prompt for topic-based organization.
 */
export function buildPersonalReportPrompt(
  candidates: MergedCandidate[],
  config: PersonalReportConfig,
  coverageFrom: string,
  coverageTo: string,
): string {
  const candidateBlock = candidates
    .map(
      (c, i) =>
        `[${i + 1}] ${c.title} (${c.subject})\n` +
        `  Summary: ${c.summary}\n` +
        `  Type: ${c.infoType}, Time: ${c.eventTime}, Official: ${c.officialConfirmed}\n` +
        `  Source: ${c.sourceName} — ${c.sourceUrl}\n` +
        (c.additionalSources.length > 0
          ? `  Also found at: ${c.additionalSources.join(", ")}\n`
          : "") +
        `  Raw: ${c.rawSummary}`,
    )
    .join("\n\n");

  return `你是一位 AI 技术领域的个人情报分析师。你的任务是将以下候选信息整理成一份结构化的中文个人简报。

## 用户画像
- 主力工具：${config.primaryTools.join("、")}
- 平台：${config.platforms.join("、")}
- 使用场景：${config.usageContext}
- 关注维度：${config.focusTopics.join("、")}
- 排除维度：${config.excludedTopics.join("、")}

## 覆盖时间
${coverageFrom} ～ ${coverageTo}

## 候选信息
${candidateBlock}

## 输出要求

请输出严格的 JSON（不要包含 markdown 代码块标记），结构如下：

{
  "overview": [
    { "topic": "主题名", "summary": "一句话结论" }
  ],
  "toolStatus": {
    "Codex": "一句话状态或'本期无重要更新'",
    "Claude Code": "一句话状态或'本期无重要更新'"
  },
  "topics": [
    {
      "name": "主题名（根据数据动态生成）",
      "items": [
        {
          "title": "条目标题",
          "what": "发生了什么",
          "why": "为什么值得关注",
          "impact": "对用户的影响",
          "action": "建议行动（仅在确有必要时提供，否则省略此字段）",
          "status": "已确认 或 社区信号",
          "sources": [{ "name": "来源名", "url": "来源URL" }]
        }
      ]
    }
  ]
}

## 规则
1. overview 最多 ${config.overviewLimit} 条，每条一句话，是正文的索引而非复制。
2. 正文 topics 中的 items 总数不超过 ${config.detailLimit} 条。
3. 按主题组织，不按来源或项目组织。主题根据当天数据动态生成。
4. 主力工具没有高价值更新时，toolStatus 中写"本期无重要更新"。
5. 陌生项目必须说明"它是什么"和"为什么与你有关"。
6. 社区来源但未经官方确认的内容标注 status 为"社区信号"。
7. 商业机会只有在具体、可信、可行动时才在 impact 或 action 中提及。
8. 禁止把普通版本发布、star 数量或讨论热度本身当作价值理由。
9. 所有 sources 中的 URL 必须来自候选输入，禁止编造。
10. 排除维度中的内容不要纳入报告。
11. 纯版本号更新不值得单独列出，除非有实质功能变化。`;
}

/**
 * Generates the personal report: LLM call → JSON → file save.
 */
export async function generatePersonalReport(
  candidates: MergedCandidate[],
  config: PersonalReportConfig,
  coverageFrom: string,
  coverageTo: string,
  dateStr: string,
  lang: Lang,
): Promise<{ json: PersonalReportJson; markdown: string } | null> {
  if (candidates.length === 0) {
    console.log("  [personal] No candidates — skipping report generation.");
    return null;
  }

  const prompt = buildPersonalReportPrompt(candidates, config, coverageFrom, coverageTo);
  const raw = await callLlm(prompt, PERSONAL_REPORT_TOKENS);
  const json = parseLlmJson<PersonalReportJson>(raw);

  if (!json || !json.topics) {
    console.error("  [personal] Failed to parse LLM response as JSON.");
    return null;
  }

  // Ensure coverage metadata
  json.generatedAt = new Date().toISOString();
  json.coverageFrom = coverageFrom;
  json.coverageTo = coverageTo;

  const markdown = renderMarkdown(json, dateStr, lang);

  // Save both JSON and Markdown
  saveFile(JSON.stringify(json, null, 2), dateStr, "personal-digest.json");
  saveFile(markdown, dateStr, lang === "zh" ? "ai-personal.md" : "ai-personal-en.md");

  return { json, markdown };
}

/**
 * Renders the structured JSON report to Markdown.
 */
function renderMarkdown(report: PersonalReportJson, dateStr: string, lang: Lang): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${lang === "zh" ? "AI 前沿个人简报" : "AI Frontier Personal Briefing"} ${dateStr}`);
  lines.push("");
  lines.push(
    `> ${lang === "zh" ? "覆盖时间" : "Coverage"}：${report.coverageFrom} ～ ${report.coverageTo}`,
  );
  lines.push("");

  // 5-minute overview
  lines.push(`## ${lang === "zh" ? "五分钟概览" : "5-Minute Overview"}`);
  lines.push("");
  if (report.overview?.length) {
    report.overview.forEach((item, i) => {
      lines.push(`${i + 1}. **${item.topic}**：${item.summary}`);
    });
  } else {
    lines.push(lang === "zh" ? "本期无重要更新。" : "No significant updates this period.");
  }
  lines.push("");

  // Primary tool status
  lines.push(`## ${lang === "zh" ? "主力工具状态" : "Primary Tool Status"}`);
  lines.push("");
  for (const [tool, status] of Object.entries(report.toolStatus ?? {})) {
    lines.push(`- **${tool}**：${status}`);
  }
  lines.push("");

  // Topic sections
  for (const topic of report.topics ?? []) {
    lines.push(`## ${topic.name}`);
    lines.push("");
    for (const item of topic.items ?? []) {
      lines.push(`### ${item.title}`);
      lines.push("");
      lines.push(`- ${lang === "zh" ? "发生了什么" : "What"}：${item.what}`);
      lines.push(`- ${lang === "zh" ? "为什么值得关注" : "Why"}：${item.why}`);
      lines.push(`- ${lang === "zh" ? "对你的影响" : "Impact"}：${item.impact}`);
      if (item.action) {
        lines.push(`- ${lang === "zh" ? "建议行动" : "Action"}：${item.action}`);
      }
      lines.push(
        `- ${lang === "zh" ? "状态" : "Status"}：${item.status}`,
      );
      const sourceLinks = (item.sources ?? [])
        .map((s) => `[${s.name}](${s.url})`)
        .join(" · ");
      lines.push(`- ${lang === "zh" ? "来源" : "Sources"}：${sourceLinks}`);
      lines.push("");
    }
  }

  // Footer
  lines.push("---");
  lines.push(autoGenFooter(lang));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Snapshot marker helpers
// ---------------------------------------------------------------------------

export function extractTrendingSnapshot(data: TrendingData): TrendingSnapshot {
  return data.snapshotMarkers;
}

export function extractHfSnapshot(data: HfData): HfSnapshot {
  return data.snapshotMarkers;
}
