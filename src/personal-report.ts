/**
 * Personal report generation: candidate extraction, balanced pool building,
 * cross-source merge, two-stage LLM filtering/generation, validation,
 * and Markdown rendering.
 *
 * Pipeline: raw data → candidates → balanced pool → LLM filter → LLM report
 *           → validate → JSON + Markdown
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

export type UpdateKind = "new" | "updated" | "snapshot-change";

export interface FilterResultItem {
  /** Final event title after merge. */
  title: string;
  /** Candidate IDs kept for this event. */
  keepIds: string[];
  /** Candidate IDs merged into this event. */
  mergedIds: string[];
  /** Topic assignment. */
  topic: string;
  /** Why this event is relevant. */
  relevance: string;
  /** Confidence: high / medium / low. */
  confidence: "high" | "medium" | "low";
  /** Brief reason for inclusion. */
  reason: string;
  /** Whether the project needs background context. */
  needsContext: boolean;
}

export interface FilterResult {
  kept: FilterResultItem[];
  excluded: Array<{ id: string; reason: string }>;
}

export interface PersonalReportJson {
  generatedAt: string;
  coverageFrom: string;
  coverageTo: string;
  overview: Array<{ id: string; topic: string; summary: string }>;
  toolStatus: Record<string, string>;
  topics: Array<{
    name: string;
    items: Array<{
      id: string;
      candidateIds: string[];
      title: string;
      eventTime: string;
      updateKind: UpdateKind;
      what: string;
      why: string;
      impact: string;
      action?: string;
      status: "已确认" | "社区信号";
      projectContext?: string;
      sources: Array<{ name: string; url: string }>;
    }>;
  }>;
}

export type ValidateErrorCode =
  | "OVERVIEW_OVER_LIMIT"
  | "DETAILS_OVER_LIMIT"
  | "MISSING_ITEM_ID"
  | "MISSING_EVENT_TIME"
  | "INVALID_STATUS"
  | "INVALID_UPDATE_KIND"
  | "OVERVIEW_REF_MISSING"
  | "TOOL_STATUS_MISSING_TOOL"
  | "FABRICATED_URL"
  | "MISSING_SOURCE_URL"
  | "MISSING_CANDIDATE_IDS";

export interface ValidateResult {
  ok: boolean;
  errors: Array<{ code: ValidateErrorCode; message: string }>;
}

// ---------------------------------------------------------------------------
// Balanced pool constants
// ---------------------------------------------------------------------------

export const CATEGORY_LIMITS = {
  codex: 8,
  claudeCode: 8,
  otherCli: 6,
  webOpenai: 4,
  webAnthropic: 4,
  hn: 5,
  arxiv: 3,
  hf: 3,
  ph: 3,
  trending: 3,
  community: 3,
  skills: 3,
} as const;

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

/** Round-robin interleave arrays. */
function interleave(arrays: CandidateItem[][]): CandidateItem[] {
  const result: CandidateItem[] = [];
  const maxLen = Math.max(...arrays.map((a) => a.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const arr of arrays) {
      if (i < arr.length) result.push(arr[i]!);
    }
  }
  return result;
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
// Balanced Pool Builder — prevents source starvation
// ---------------------------------------------------------------------------

/** Categorize a candidate's source for pool balancing. */
function categorizeSource(c: CandidateItem, primaryTools: string[]): string {
  const src = c.sourceName.toLowerCase();
  const subj = c.subject.toLowerCase();

  if (src === "hacker news") return "hn";
  if (src === "arxiv") return "arxiv";
  if (src === "hugging face") return "hf";
  if (src === "product hunt") return "ph";
  if (src === "dev.to" || src === "lobste.rs") return "community";
  if (src.includes("trending") || src.includes("search")) return "trending";
  if (src.includes("anthropic") && src.includes("skills")) return "skills";

  // Web sources
  if (subj.includes("openai") || src.includes("openai")) return "webOpenai";
  if (subj.includes("anthropic") || subj.includes("claude")) return "webAnthropic";

  // GitHub repos — classify by primary tool
  for (const tool of primaryTools) {
    if (tool === "codex" && (subj.includes("codex") || subj.includes("openai codex"))) return "codex";
    if (tool === "claude-code" && (subj.includes("claude code") || subj.includes("claude-code"))) return "claudeCode";
  }

  return "otherCli";
}

/**
 * Build a balanced candidate pool with per-source category caps.
 *
 * Replaces the naive `slice(0, detailLimit)` that starved non-GitHub sources.
 * Uses round-robin interleaving to ensure each source category gets representation.
 */
export function buildBalancedPool(
  candidates: CandidateItem[],
  config: PersonalReportConfig,
  limits: Record<string, number> = CATEGORY_LIMITS as Record<string, number>,
): CandidateItem[] {
  // Group by category
  const groups = new Map<string, CandidateItem[]>();
  for (const c of candidates) {
    const cat = categorizeSource(c, config.primaryTools);
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(c);
  }

  // Sort each group by time and apply per-category caps
  const cappedGroups: CandidateItem[][] = [];
  for (const [cat, items] of groups) {
    const sorted = sortByTime(items);
    const limit = limits[cat] ?? 3;
    cappedGroups.push(sorted.slice(0, limit));
  }

  // Interleave: take one from each group in round-robin order
  // This ensures later-processed sources aren't starved
  return interleave(cappedGroups);
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
// Stage 1: LLM Filter Prompt — candidate filtering and semantic merge
// ---------------------------------------------------------------------------

const FILTER_TOKENS = 6144;

/**
 * Builds the LLM prompt for Stage 1: filtering, relevance judgment,
 * and cross-source semantic merging.
 */
export function buildFilterPrompt(
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

  return `你是一位 AI 技术领域的个人情报筛选分析师。你的任务是从以下候选信息中筛选出值得进入最终报告的事件，并进行跨来源语义合并。

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
  "kept": [
    {
      "title": "事件标题",
      "keepIds": [1, 5],
      "mergedIds": [8],
      "topic": "主题名",
      "relevance": "与用户的相关维度说明",
      "confidence": "high 或 medium 或 low",
      "reason": "保留理由",
      "needsContext": false
    }
  ],
  "excluded": [
    { "id": 3, "reason": "排除理由" }
  ]
}

## 筛选规则

1. 主力工具优先，但不保证入选。
2. 普通版本号、star 数量和讨论热度本身不是价值理由。
3. 模糊投诉和没有事实细节的 Issue 淘汰。
4. 纯 UI、项目自身 CI、治理争议、市场定位、常规 Claw 动态淘汰。
5. Slack 等用户不使用的场景，除非体现了可迁移到用户工作流的重大能力，否则淘汰。
6. 同一发布在官网、GitHub、HN、社区出现时合并成一个事件，keepIds 保留所有相关候选编号。
7. 不设置最低数量。宁缺毋滥。
8. 最多保留 ${config.detailLimit} 个事件。
9. 确信度为 low 且无事实支撑的条目应排除。
10. 排除维度中的内容不要纳入。
11. 模糊的"用量泄漏"或类似低证据投诉应排除。
12. keepIds 中的编号必须来自输入候选列表。
13. 需要背景说明的陌生项目设置 needsContext 为 true。`;
}

/**
 * Generates the personal report: two-stage LLM call → JSON → validate → file save.
 *
 * Stage 1: Filter + semantic merge
 * Stage 2: Generate structured report from filtered events
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
    console.log("  [personal] No candidates — generating no-update report.");
    return generateNoUpdateReport(config, coverageFrom, coverageTo, dateStr, lang);
  }

  // Stage 1: Filter and merge
  console.log("  [personal] Stage 1: filtering and merging candidates...");
  const filterPrompt = buildFilterPrompt(candidates, config, coverageFrom, coverageTo);
  const filterRaw = await callLlm(filterPrompt, FILTER_TOKENS);
  const filterResult = parseLlmJson<FilterResult>(filterRaw);

  if (!filterResult || !Array.isArray(filterResult.kept)) {
    console.error("  [personal] Stage 1 filter failed — aborting.");
    return null;
  }

  if (filterResult.kept.length === 0) {
    console.log("  [personal] Stage 1 filtered all candidates — generating no-update report.");
    return generateNoUpdateReport(config, coverageFrom, coverageTo, dateStr, lang);
  }

  console.log(`  [personal] Filter: ${filterResult.kept.length} events kept, ${filterResult.excluded?.length ?? 0} excluded`);

  // Stage 2: Generate report from filtered events
  console.log("  [personal] Stage 2: generating structured report...");
  const reportPrompt = buildReportPrompt(candidates, filterResult, config, coverageFrom, coverageTo);
  const reportTokens = 8192;
  const raw = await callLlm(reportPrompt, reportTokens);
  const json = parseLlmJson<PersonalReportJson>(raw);

  if (!json || !json.topics) {
    console.error("  [personal] Stage 2 report parse failed.");
    return null;
  }

  // Ensure coverage metadata
  json.generatedAt = new Date().toISOString();
  json.coverageFrom = coverageFrom;
  json.coverageTo = coverageTo;

  // Validate
  const candidateUrlSet = buildCandidateUrlSet(candidates);
  const validation = validateReport(json, config, candidateUrlSet);

  if (!validation.ok) {
    console.error("  [personal] Validation failed:");
    for (const err of validation.errors) {
      console.error(`    ${err.code}: ${err.message}`);
    }
    return null;
  }

  const markdown = renderMarkdown(json, dateStr, lang);

  // Save both JSON and Markdown
  saveFile(JSON.stringify(json, null, 2), dateStr, "personal-digest.json");
  saveFile(markdown, dateStr, lang === "zh" ? "ai-personal.md" : "ai-personal-en.md");

  return { json, markdown };
}

/**
 * Generates a deterministic "no important updates" report.
 */
export function generateNoUpdateReport(
  config: PersonalReportConfig,
  coverageFrom: string,
  coverageTo: string,
  dateStr: string,
  lang: Lang,
): { json: PersonalReportJson; markdown: string } {
  const toolStatus: Record<string, string> = {};
  for (const tool of config.primaryTools) {
    toolStatus[tool] = "本期无重要更新";
  }

  const json: PersonalReportJson = {
    generatedAt: new Date().toISOString(),
    coverageFrom,
    coverageTo,
    overview: [],
    toolStatus,
    topics: [],
  };

  const markdown = renderMarkdown(json, dateStr, lang);

  saveFile(JSON.stringify(json, null, 2), dateStr, "personal-digest.json");
  saveFile(markdown, dateStr, lang === "zh" ? "ai-personal.md" : "ai-personal-en.md");

  return { json, markdown };
}

// ---------------------------------------------------------------------------
// Stage 2: Report Prompt — generate structured report from filtered events
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt for Stage 2: generate the final structured report
 * from the filtered and merged events.
 */
export function buildReportPrompt(
  candidates: MergedCandidate[],
  filterResult: FilterResult,
  config: PersonalReportConfig,
  coverageFrom: string,
  coverageTo: string,
): string {
  // Build candidate lookup by 1-indexed position
  const candidateLookup = new Map<number, MergedCandidate>();
  candidates.forEach((c, i) => candidateLookup.set(i + 1, c));

  // Build filtered event blocks with full context
  const eventBlocks = filterResult.kept
    .map((event, i) => {
      const keepCandidates = event.keepIds
        .map((id) => candidateLookup.get(Number(id)))
        .filter(Boolean) as MergedCandidate[];
      const mergedCandidates = (event.mergedIds ?? [])
        .map((id) => candidateLookup.get(Number(id)))
        .filter(Boolean) as MergedCandidate[];
      const allCandidates = [...keepCandidates, ...mergedCandidates];

      const allSources = allCandidates.flatMap((c) => [
        { name: c.sourceName, url: c.sourceUrl },
        ...c.additionalSources.map((url) => ({ name: "Additional Source", url })),
      ]);
      // Dedup sources by URL
      const seenUrls = new Set<string>();
      const uniqueSources = allSources.filter((s) => {
        if (seenUrls.has(s.url)) return false;
        seenUrls.add(s.url);
        return true;
      });

      return (
        `[Event ${i + 1}] ${event.title}\n` +
        `  Topic: ${event.topic}\n` +
        `  Relevance: ${event.relevance}\n` +
        `  Confidence: ${event.confidence}\n` +
        `  Needs Context: ${event.needsContext}\n` +
        `  Candidate Details:\n` +
        allCandidates
          .map(
            (c) =>
              `    - ${c.title} (${c.subject})\n` +
              `      Summary: ${c.summary}\n` +
              `      Type: ${c.infoType}, Time: ${c.eventTime}, Official: ${c.officialConfirmed}\n` +
              `      Source: ${c.sourceName} — ${c.sourceUrl}\n` +
              `      Raw: ${c.rawSummary}`,
          )
          .join("\n") +
        `\n  Available Sources: ${JSON.stringify(uniqueSources)}`
      );
    })
    .join("\n\n");

  return `你是一位 AI 技术领域的个人情报分析师。你的任务是将以下已筛选的事件整理成一份结构化的中文个人简报。

## 用户画像
- 主力工具：${config.primaryTools.join("、")}
- 平台：${config.platforms.join("、")}
- 使用场景：${config.usageContext}
- 关注维度：${config.focusTopics.join("、")}
- 排除维度：${config.excludedTopics.join("、")}

## 覆盖时间
${coverageFrom} ～ ${coverageTo}

## 已筛选事件
${eventBlocks}

## 输出要求

请输出严格的 JSON（不要包含 markdown 代码块标记），结构如下：

{
  "overview": [
    { "id": "evt-1", "topic": "主题名", "summary": "一句话结论" }
  ],
  "toolStatus": {
    "codex": "一句话状态或'本期无重要更新'",
    "claude-code": "一句话状态或'本期无重要更新'"
  },
  "topics": [
    {
      "name": "主题名",
      "items": [
        {
          "id": "evt-1",
          "candidateIds": ["https://github.com/..."],
          "title": "条目标题",
          "eventTime": "2026-07-27T08:00:00Z",
          "updateKind": "new",
          "what": "发生了什么",
          "why": "为什么值得关注",
          "impact": "对用户的影响",
          "action": "建议行动（可选）",
          "status": "已确认",
          "projectContext": "陌生项目的背景说明（需要时）",
          "sources": [{ "name": "GitHub", "url": "https://github.com/..." }]
        }
      ]
    }
  ]
}

## 规则

1. overview 最多 ${config.overviewLimit} 条，每条引用一个正文条目的 id。
2. 正文 topics 中的 items 总数不超过 ${config.detailLimit} 条。
3. 按主题组织，不按来源或项目组织。
4. 每个条目必须有唯一的 id（格式 evt-N）。
5. 每个条目必须有 eventTime（ISO-8601 格式），来自对应候选事件的时间。
6. 每个条目必须有 candidateIds，列出对应的原始候选 URL。
7. updateKind 必须是 "new"、"updated" 或 "snapshot-change" 之一。
8. status 必须是 "已确认" 或 "社区信号"。
9. sources 中的 URL 必须来自候选事件的 Available Sources，禁止编造。
10. toolStatus 的 key 必须是：${config.primaryTools.join("、")}。
11. 主力工具没有高价值更新时，toolStatus 写"本期无重要更新"。
12. 陌生项目必须包含 projectContext，说明"它是什么"和"为什么与你有关"。
13. 商业机会只有在具体、可信、可行动时才在 impact 或 action 中提及。
14. 纯版本号更新不值得单独列出，除非有实质功能变化。`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Build the set of all valid URLs from candidates for URL whitelist checking. */
export function buildCandidateUrlSet(candidates: MergedCandidate[]): Set<string> {
  const urls = new Set<string>();
  for (const c of candidates) {
    urls.add(c.sourceUrl);
    for (const url of c.additionalSources) {
      urls.add(url);
    }
  }
  return urls;
}

const VALID_STATUSES = new Set(["已确认", "社区信号"]);
const VALID_UPDATE_KINDS = new Set(["new", "updated", "snapshot-change"]);

/**
 * Validates the LLM-generated report JSON against strict rules.
 */
export function validateReport(
  json: PersonalReportJson,
  config: PersonalReportConfig,
  candidateUrls: Set<string>,
): ValidateResult {
  const errors: ValidateResult["errors"] = [];

  // Check overview limit
  if (json.overview && json.overview.length > config.overviewLimit) {
    errors.push({
      code: "OVERVIEW_OVER_LIMIT",
      message: `overview has ${json.overview.length} items, limit is ${config.overviewLimit}`,
    });
  }

  // Collect all item IDs and validate items
  const allItemIds = new Set<string>();
  const allItems = (json.topics ?? []).flatMap((t) => t.items ?? []);

  // Check detail limit
  if (allItems.length > config.detailLimit) {
    errors.push({
      code: "DETAILS_OVER_LIMIT",
      message: `total items ${allItems.length}, limit is ${config.detailLimit}`,
    });
  }

  for (const item of allItems) {
    // Item ID
    if (!item.id) {
      errors.push({ code: "MISSING_ITEM_ID", message: `item missing id: ${item.title}` });
    } else {
      allItemIds.add(item.id);
    }

    // Event time
    if (!item.eventTime || item.eventTime === "0") {
      errors.push({ code: "MISSING_EVENT_TIME", message: `item missing eventTime: ${item.title}` });
    }

    // Status
    if (!VALID_STATUSES.has(item.status)) {
      errors.push({ code: "INVALID_STATUS", message: `invalid status "${item.status}" in: ${item.title}` });
    }

    // Update kind
    if (!VALID_UPDATE_KINDS.has(item.updateKind)) {
      errors.push({
        code: "INVALID_UPDATE_KIND",
        message: `invalid updateKind "${item.updateKind}" in: ${item.title}`,
      });
    }

    // Candidate IDs present
    if (!item.candidateIds || item.candidateIds.length === 0) {
      errors.push({ code: "MISSING_CANDIDATE_IDS", message: `item missing candidateIds: ${item.title}` });
    }

    // Source URL whitelist
    for (const source of item.sources ?? []) {
      if (!source.url) {
        errors.push({ code: "MISSING_SOURCE_URL", message: `source missing url in: ${item.title}` });
      } else if (!candidateUrls.has(source.url)) {
        errors.push({
          code: "FABRICATED_URL",
          message: `fabricated URL not in candidates: ${source.url} (in: ${item.title})`,
        });
      }
    }
  }

  // Overview references valid item IDs
  for (const ov of json.overview ?? []) {
    if (ov.id && !allItemIds.has(ov.id)) {
      errors.push({
        code: "OVERVIEW_REF_MISSING",
        message: `overview references non-existent item: ${ov.id}`,
      });
    }
  }

  // toolStatus must contain all primary tools
  const toolStatusKeys = new Set(Object.keys(json.toolStatus ?? {}));
  for (const tool of config.primaryTools) {
    if (!toolStatusKeys.has(tool)) {
      errors.push({
        code: "TOOL_STATUS_MISSING_TOOL",
        message: `toolStatus missing primary tool: ${tool}`,
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Report Rendering: Markdown
// ---------------------------------------------------------------------------

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
      if (item.updateKind) {
        const kindLabel = item.updateKind === "new" ? "本期新建" : item.updateKind === "updated" ? "旧事项更新" : "快照变化";
        lines.push(`- ${lang === "zh" ? "更新类型" : "Update Type"}：${kindLabel}`);
      }
      if (item.eventTime) {
        lines.push(`- ${lang === "zh" ? "时间" : "Time"}：${item.eventTime}`);
      }
      const sourceLinks = (item.sources ?? [])
        .map((s) => `[${s.name}](${s.url})`)
        .join(" · ");
      lines.push(`- ${lang === "zh" ? "来源" : "Sources"}：${sourceLinks}`);
      if (item.projectContext) {
        lines.push(`- ${lang === "zh" ? "项目背景" : "Project Context"}：${item.projectContext}`);
      }
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
