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

export interface ReportEvent {
  /** Stable ID assigned by Stage 1 filter, binding this event to its source candidates. */
  filterEventId?: string;
  id: string;
  title: string;
  topic: string;
  eventTime: string;
  updateKind: UpdateKind;
  status: "已确认" | "社区信号";
  quick: {
    what: string;
    why: string;
    impact: string;
    action?: string;
  };
  full: {
    background: string;
    evidence: string;
    analysis: string;
    impact: string;
    action: string;
    limitations?: string;
  };
  candidateIds: string[];
  sources: Array<{ name: string; url: string }>;
  projectContext?: string;
}

export interface TopicGroup {
  name: string;
  eventIds: string[];
}

export interface PersonalReportJson {
  generatedAt: string;
  coverageFrom: string;
  coverageTo: string;
  toolStatus: Record<string, string>;
  events: ReportEvent[];
  fiveMinuteBrief: {
    topicGroups: TopicGroup[];
  };
  fullReport: {
    topicGroups: TopicGroup[];
  };
}

export type ValidateErrorCode =
  | "EVENTS_OVER_LIMIT"
  | "FIVE_MINUTE_OVER_LIMIT"
  | "FIVE_MINUTE_DUPLICATE_ID"
  | "MISSING_EVENT_ID"
  | "DUPLICATE_EVENT_ID"
  | "MISSING_EVENT_TIME"
  | "INVALID_STATUS"
  | "INVALID_UPDATE_KIND"
  | "MISSING_QUICK_FIELDS"
  | "MISSING_FULL_FIELDS"
  | "FIVE_MINUTE_NOT_SUBSET"
  | "EMPTY_EVENTS_WITH_TOOL_STATUS"
  | "TOOL_STATUS_MISSING_TOOL"
  | "FABRICATED_URL"
  | "MISSING_SOURCE_URL"
  | "MISSING_CANDIDATE_IDS"
  | "FIVE_MINUTE_EVENT_MISSING"
  | "FULL_REPORT_EVENT_MISSING"
  | "FULL_REPORT_DUPLICATE_ID"
  | "ORPHAN_EVENT"
  | "EVENTS_FULLREPORT_COUNT_MISMATCH"
  | "UNKNOWN_FILTER_EVENT_ID"
  | "FILTER_EVENT_MULTI_MAPPED"
  | "FILTER_EVENT_NOT_MAPPED"
  | "SOURCE_LEAKED_FROM_OTHER_FILTER_EVENT"
  | "TOPIC_GROUP_INVALID_EVENT_ID";

export interface ValidateResult {
  ok: boolean;
  errors: Array<{ code: ValidateErrorCode; message: string }>;
}

// ---------------------------------------------------------------------------
// Runtime schema guard — rejects old summary-based overview
// ---------------------------------------------------------------------------

/**
 * Checks whether a parsed JSON object conforms to the current PersonalReportJson
 * schema. Returns `null` if valid, or an error message if malformed.
 */
export function guardReportSchema(json: unknown): string | null {
  if (!json || typeof json !== "object") return "report is not an object";
  const obj = json as Record<string, unknown>;

  // Reject old schema
  if ("overview" in obj && !("events" in obj)) {
    return "旧 schema：使用 overview+topics 而非 events+fiveMinuteBrief+fullReport，需要重新生成";
  }
  if ("topics" in obj && !("events" in obj)) {
    return "旧 schema：使用 topics 而非 events，需要重新生成";
  }

  if (!Array.isArray(obj["events"])) return "events is not an array";
  if (!obj["toolStatus"] || typeof obj["toolStatus"] !== "object") return "toolStatus missing";
  if (!obj["fiveMinuteBrief"] || typeof obj["fiveMinuteBrief"] !== "object") return "fiveMinuteBrief missing";
  if (!obj["fullReport"] || typeof obj["fullReport"] !== "object") return "fullReport missing";
  if (!obj["coverageFrom"] || !obj["coverageTo"]) return "coverage metadata missing";

  // generatedAt must be present, non-empty, and valid ISO-8601
  if (typeof obj["generatedAt"] !== "string" || !(obj["generatedAt"] as string).trim()) {
    return "generatedAt missing or empty";
  }
  if (isNaN(Date.parse(obj["generatedAt"] as string))) {
    return `generatedAt is not valid ISO-8601: ${obj["generatedAt"]}`;
  }

  const fiveMinuteBrief = obj["fiveMinuteBrief"] as Record<string, unknown>;
  const fullReport = obj["fullReport"] as Record<string, unknown>;
  if (!Array.isArray(fiveMinuteBrief["topicGroups"])) return "fiveMinuteBrief.topicGroups missing";
  if (!Array.isArray(fullReport["topicGroups"])) return "fullReport.topicGroups missing";

  // Validate events
  for (const evt of obj["events"] as Record<string, unknown>[]) {
    if (!evt || typeof evt !== "object") return "event is not an object";
    if (!evt["id"] || typeof evt["id"] !== "string") return "event missing id";
    if (!evt["title"] || typeof evt["title"] !== "string") return "event missing title";
    if (!evt["quick"] || typeof evt["quick"] !== "object") return "event missing quick";
    const quick = evt["quick"] as Record<string, unknown>;
    if (!quick["what"] || !quick["why"] || !quick["impact"]) return "event.quick missing what/why/impact";
    if (!evt["full"] || typeof evt["full"] !== "object") return "event missing full";
    const full = evt["full"] as Record<string, unknown>;
    if (!full["impact"]) return "event.full missing impact";
  }

  return null;
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

function extractReleaseCandidates(releases: GitHubRelease[], cfg: RepoConfig): CandidateItem[] {
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

export function extractTrendingCandidates(data: TrendingData, maxItems = 5): CandidateItem[] {
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
    if (tool === "claude-code" && (subj.includes("claude code") || subj.includes("claude-code")))
      return "claudeCode";
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
export function selectFinalItems(merged: MergedCandidate[], limit: number): MergedCandidate[] {
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
        (c.additionalSources.length > 0 ? `  Also found at: ${c.additionalSources.join(", ")}\n` : "") +
        `  Raw: ${c.rawSummary}`,
    )
    .join("\n\n");

  return `你是一位 AI 技术领域的个人情报筛选分析师。你的任务是从以下候选信息中筛选出值得进入最终报告的事件，并进行跨来源语义合并。

## 用户画像
- 主力工具：${config.primaryTools.join("、")}
- 平台：${config.platforms.join("、")}
- 使用场景：${config.usageContext}
- 实际模型后端：${config.modelBackend}
- 是否使用 Anthropic Claude 账号：${config.usesAnthropicAccount ? "是" : "否"}
- 是否使用 Anthropic Claude 订阅：${config.usesAnthropicSubscription ? "是" : "否"}
- 高优先级关注方向：${config.focusTopics.join("、")}
- 一般关注方向（仅在有重大突破、明确工程价值或可立即落地时收录）：${config.secondaryTopics.join("、")}
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

## 五分钟概览入选门槛（最高优先级）

只有满足以下至少一项的事件才可能进入五分钟概览：
- 会改变用户当前的行动或决策
- 会改变工具或模型选择
- 明确扩展当前能力边界
- 明显提高效率或可靠性
- 解决用户实际可能遇到的问题
- 能直接用于用户的项目

## 完整报告入选门槛

完整报告可以比五分钟概览稍宽，但仍必须满足：
- 对当前项目有明确工程参考价值；或
- 提供可以验证、试用、迁移或实施的方法；或
- 会影响后续技术选择和架构决策

## 筛选规则

1. 主力工具优先，但不保证入选。
2. 普通版本号、star 数量和讨论热度本身不是价值理由。
3. 模糊投诉和没有事实细节的 Issue 淘汰。
4. 纯 UI、项目自身 CI、治理争议、市场定位、常规 Claw 动态淘汰。
5. Slack 等用户不使用的场景，除非体现了可迁移到用户工作流的重大能力，否则淘汰。
6. 同一发布在官网、GitHub、HN、社区出现时合并成一个事件，keepIds 保留所有相关候选编号。
7. 不设置最低数量。宁缺毋滥。
8. 最多保留 ${config.fullReportLimit} 个事件，按价值从高到低排列。
9. 确信度为 low 且无事实支撑的条目应排除。
10. 排除维度中的内容不要纳入。
11. 模糊的"用量泄漏"或类似低证据投诉应排除。
12. keepIds 中的编号必须来自输入候选列表。
13. 需要背景说明的陌生项目设置 needsContext 为 true。

## 明确排除或降级

- ${config.usesAnthropicSubscription ? "" : "Anthropic Claude 模型/账号/订阅/价格变化 → 直接排除（用户不使用）"}
- AI CLI 活跃度、Star、热度、成熟度和普通横向排行榜 → 排除
- 普通 Claw 项目动态 → 排除
- 普通 OpenCode、Gemini CLI 等非主力工具的普通版本动态 → 排除
- 只说明"某工具发布了"而没有实质能力变化的内容 → 排除
- 公司战略、市场定位、社区治理 → 排除
- 普通 UI、CI、贡献流程 → 排除
- 没有工程证据的概念介绍 → 排除
- 仅用于把数量补到 ${config.fullReportLimit} 条的低价值信息 → 排除

## 特殊规则

- 非主力工具只有出现可迁移到 Codex、Claude Code 或当前项目的重大能力时才收录。
- 排行榜只有在评测方法可靠、与 ${config.modelBackend} 或当前模型选择直接相关，并且会改变实际决策时才允许收录。
- Windows Bug 修复只有在用户实际可能受影响，或者升级会改变当前行动时进入概览；否则降级到工具状态或删除。
- 陌生项目必须说明"它是什么、解决什么问题、为什么与用户有关"，否则排除。`;
}

/**
 * Deterministic cap: truncate Stage 1 kept items to fullReportLimit.
 * Returns a new FilterResult without mutating the input.
 * Preserves original ordering — keeps the first N items.
 */
export function capFilterResult(filterResult: FilterResult, limit: number): FilterResult {
  if (filterResult.kept.length <= limit) return filterResult;
  return {
    kept: filterResult.kept.slice(0, limit),
    excluded: filterResult.excluded,
  };
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
  let filterResult = parseLlmJson<FilterResult>(filterRaw);

  if (!filterResult || !Array.isArray(filterResult.kept)) {
    console.error("  [personal] Stage 1 filter failed — aborting.");
    return null;
  }

  if (filterResult.kept.length === 0) {
    console.log("  [personal] Stage 1 filtered all candidates — generating no-update report.");
    return generateNoUpdateReport(config, coverageFrom, coverageTo, dateStr, lang);
  }

  // Deterministic cap: Stage 1 must not exceed fullReportLimit
  if (filterResult.kept.length > config.fullReportLimit) {
    console.log(
      `  [personal] Stage 1 returned ${filterResult.kept.length} events, capping to ${config.fullReportLimit}`,
    );
    filterResult = capFilterResult(filterResult, config.fullReportLimit);
  }

  console.log(
    `  [personal] Filter: ${filterResult.kept.length} events kept, ${filterResult.excluded?.length ?? 0} excluded`,
  );

  // Validate Stage 1 filter result integrity
  const filterValidation = validateFilterResult(filterResult, candidates.length);
  if (!filterValidation.ok) {
    console.error("  [personal] Stage 1 filter validation failed:");
    for (const err of filterValidation.errors) {
      console.error(`    ${err.code}: ${err.message}`);
    }
    return null;
  }

  // Stage 2: Generate report from filtered events
  console.log("  [personal] Stage 2: generating structured report...");
  const reportPrompt = buildReportPrompt(candidates, filterResult, config, coverageFrom, coverageTo);
  const reportTokens = 8192;
  const raw = await callLlm(reportPrompt, reportTokens);
  const json = parseLlmJson<PersonalReportJson>(raw);

  if (!json || !json.events) {
    console.error("  [personal] Stage 2 report parse failed.");
    return null;
  }

  // Ensure coverage metadata
  json.generatedAt = new Date().toISOString();
  json.coverageFrom = coverageFrom;
  json.coverageTo = coverageTo;

  // Validate using per-filterEventId URL sets (not a global whitelist)
  const filterEventUrlMap = buildFilterEventUrlMap(candidates, filterResult);
  const allKeptUrls = new Set<string>();
  for (const urls of filterEventUrlMap.values()) {
    for (const url of urls) allKeptUrls.add(url);
  }
  const validation = validateReport(json, config, allKeptUrls, filterEventUrlMap);

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
    toolStatus,
    events: [],
    fiveMinuteBrief: { topicGroups: [] },
    fullReport: { topicGroups: [] },
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
        `[Event ${i + 1}] filterEventId: filter-event-${i + 1}\n` +
        `  Title: ${event.title}\n` +
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

  return `你是一位 AI 技术领域的个人情报分析师。你的任务是将以下已筛选的事件整理成一份结构化的中文个人简报，包含两层：五分钟概览和完整报告。

## 用户画像
- 主力工具：${config.primaryTools.join("、")}
- 平台：${config.platforms.join("、")}
- 使用场景：${config.usageContext}
- 高优先级关注方向：${config.focusTopics.join("、")}
- 一般关注方向（仅在重大突破或明确影响时收录）：${config.secondaryTopics.join("、")}
- 排除维度：${config.excludedTopics.join("、")}
- 是否使用 Anthropic Claude 账号：${config.usesAnthropicAccount ? "是" : "否"}
- 是否使用 Anthropic Claude 订阅：${config.usesAnthropicSubscription ? "是" : "否"}
- 实际模型后端：${config.modelBackend}

## 覆盖时间
${coverageFrom} ～ ${coverageTo}

## 已筛选事件
${eventBlocks}

## 输出要求

请输出严格的 JSON（不要包含 markdown 代码块标记），结构如下：

{
  "toolStatus": {
    "codex": "一句话状态或'本期无重要更新'",
    "claude-code": "一句话状态或'本期无重要更新'"
  },
  "events": [
    {
      "id": "evt-1",
      "filterEventId": "filter-event-1",
      "title": "事件标题",
      "topic": "主题名",
      "eventTime": "2026-07-27T08:00:00Z",
      "updateKind": "new",
      "status": "已确认",
      "quick": {
        "what": "一两句事实",
        "why": "一两句与用户的关系",
        "impact": "对用户的影响",
        "action": "建议行动"
      },
      "full": {
        "background": "背景",
        "evidence": "证据和来源细节",
        "analysis": "深入分析",
        "impact": "详细影响分析",
        "action": "具体可执行建议（如无需行动，写'无需立即行动'）",
        "limitations": "局限或风险（选填）"
      },
      "candidateIds": ["https://github.com/..."],
      "sources": [{ "name": "GitHub", "url": "https://github.com/..." }],
      "projectContext": "陌生项目的背景说明（需要时）"
    }
  ],
  "fiveMinuteBrief": {
    "topicGroups": [
      { "name": "主题名", "eventIds": ["evt-1", "evt-2"] }
    ]
  },
  "fullReport": {
    "topicGroups": [
      { "name": "主题名", "eventIds": ["evt-1", "evt-2", "evt-3"] }
    ]
  }
}

## 规则

### 事件筛选
1. 完整报告正常包含 ${config.fullReportLimit} 个真正有价值的事件；信息不足时允许更少，不准凑数。
2. 五分钟概览从完整报告中选择价值最高的 ${config.fiveMinuteLimit} 个事件。
3. fiveMinuteBrief 的 eventIds 必须是 fullReport eventIds 的子集。
4. 按动态主题组织，不按来源或项目机械分组。
5. 每个事件必须有唯一的 id（格式 evt-N）。
6. 每个事件必须原样输出 filterEventId（格式 filter-event-N），不得修改。
7. 每个事件必须有 eventTime（ISO-8601 格式）。
7. 每个事件必须有 candidateIds。
8. updateKind 必须是 "new"、"updated" 或 "snapshot-change"。
9. status 必须是 "已确认" 或 "社区信号"。
10. sources 中的 URL 必须来自候选事件的 Available Sources，禁止编造。

### 内容要求
11. quick 用于五分钟概览：what（事实）、why（与用户关系）、impact（影响）、action（行动）。
12. full 用于完整报告：background（背景）、evidence（证据）、analysis（分析）、impact（详细影响）、action（具体建议）、limitations（选填局限）。full 的所有字段（除 limitations）必须非空。如确实无需行动，action 写"无需立即行动"或具体持续观察条件。
13. quick 和 full 共享同一个事件，但信息密度不同。quick 快速传达要点，full 补充深度。
14. toolStatus 的 key 必须是：${config.primaryTools.join("、")}。
15. 主力工具没有高价值更新时，toolStatus 写"本期无重要更新"。
16. 陌生项目必须包含 projectContext。

### 排除规则
17. ${config.usesAnthropicSubscription ? "" : "用户不使用 Anthropic Claude 订阅，Anthropic Claude 模型/账号/订阅的价格变化直接排除。"}
18. AI CLI 活跃度、Star、成熟度、横向排名排除。
19. 普通 Claw 项目和生态动态排除。
20. 公司战略、市场定位、社区治理排除。
21. 纯 UI、项目自身 CI 排除。
22. 纯版本号更新排除，除非有实质功能变化。
23. 商业机会只有在具体、可信、可行动时才提及。
24. 五分钟概览的入选门槛更高：必须会改变用户当前行动、决策、能力边界、效率或可靠性。`;
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

/**
 * Build per-filterEventId URL whitelist from Stage 1 kept candidates.
 * Returns a Map: filterEventId → Set of allowed URLs (sourceUrl + additionalSources).
 * Each kept event gets a stable filterEventId: "filter-event-<1-indexed position in kept array>".
 */
export function buildFilterEventUrlMap(
  candidates: MergedCandidate[],
  filterResult: FilterResult,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (let i = 0; i < filterResult.kept.length; i++) {
    const kept = filterResult.kept[i]!;
    const filterEventId = `filter-event-${i + 1}`;
    const urls = new Set<string>();
    for (const id of [...kept.keepIds, ...(kept.mergedIds ?? [])]) {
      const idx = Number(id) - 1;
      const c = candidates[idx];
      if (c) {
        urls.add(c.sourceUrl);
        for (const url of c.additionalSources) urls.add(url);
      }
    }
    map.set(filterEventId, urls);
  }
  return map;
}

/** @deprecated Use buildFilterEventUrlMap for per-event validation. */
export function buildKeptCandidateUrlSet(
  candidates: MergedCandidate[],
  filterResult: FilterResult,
): Set<string> {
  const urls = new Set<string>();
  for (const kept of filterResult.kept) {
    for (const id of [...kept.keepIds, ...(kept.mergedIds ?? [])]) {
      const idx = Number(id) - 1;
      const c = candidates[idx];
      if (c) {
        urls.add(c.sourceUrl);
        for (const url of c.additionalSources) urls.add(url);
      }
    }
  }
  return urls;
}

export type FilterValidateErrorCode =
  | "FILTER_INVALID_CANDIDATE_ID"
  | "FILTER_KEPT_EXCLUDED_OVERLAP"
  | "FILTER_DUPLICATE_CANDIDATE_ASSIGNMENT";

export interface FilterValidateResult {
  ok: boolean;
  errors: Array<{ code: FilterValidateErrorCode; message: string }>;
}

/**
 * Normalizes a candidate ID to a canonical string form.
 * Accepts positive integers as number or string (e.g. 1, "1").
 * Rejects zero-padded strings like "01", negative numbers, non-numeric strings.
 * Returns the canonical string (e.g. "1") or null if invalid.
 */
export function normalizeCandidateId(id: unknown): string | null {
  if (typeof id === "number") {
    if (!Number.isInteger(id) || id < 1) return null;
    return String(id);
  }
  if (typeof id === "string") {
    // Reject leading zeros (e.g. "01")
    if (/^0\d+/.test(id)) return null;
    const num = Number(id);
    if (!Number.isInteger(num) || num < 1) return null;
    return String(num);
  }
  return null;
}

/**
 * Validates Stage 1 FilterResult against the input candidates.
 * - keepIds/mergedIds must reference valid 1-indexed positions
 * - No candidate can be in both kept and excluded
 * - No candidate can be assigned to multiple kept events
 * - All IDs are normalized to canonical form before comparison
 */
export function validateFilterResult(
  filterResult: FilterResult,
  candidateCount: number,
): FilterValidateResult {
  const errors: FilterValidateResult["errors"] = [];
  const keptIds = new Set<string>();
  const excludedIds = new Set<string>();

  // Build excluded set with normalized IDs
  for (const ex of filterResult.excluded ?? []) {
    const normalized = normalizeCandidateId(ex.id);
    if (normalized === null) {
      errors.push({
        code: "FILTER_INVALID_CANDIDATE_ID",
        message: `excluded entry has invalid candidate ID: ${ex.id}`,
      });
      continue;
    }
    excludedIds.add(normalized);
  }

  // Track all candidate IDs assigned to kept events
  const assignedToMultiple: string[] = [];

  for (const kept of filterResult.kept) {
    const allIds = [...kept.keepIds, ...(kept.mergedIds ?? [])];
    for (const id of allIds) {
      const normalized = normalizeCandidateId(id);
      if (normalized === null || Number(normalized) > candidateCount) {
        errors.push({
          code: "FILTER_INVALID_CANDIDATE_ID",
          message: `kept event "${kept.title}" references invalid candidate ID: ${id}`,
        });
        continue;
      }
      // Check overlap with excluded
      if (excludedIds.has(normalized)) {
        errors.push({
          code: "FILTER_KEPT_EXCLUDED_OVERLAP",
          message: `candidate ${normalized} is in both kept ("${kept.title}") and excluded`,
        });
      }
      // Check duplicate assignment across kept events
      if (keptIds.has(normalized)) {
        assignedToMultiple.push(normalized);
      }
      keptIds.add(normalized);
    }
  }

  if (assignedToMultiple.length > 0) {
    errors.push({
      code: "FILTER_DUPLICATE_CANDIDATE_ASSIGNMENT",
      message: `candidates assigned to multiple kept events: ${[...new Set(assignedToMultiple)].join(", ")}`,
    });
  }

  return { ok: errors.length === 0, errors };
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
  filterEventUrlMap?: Map<string, Set<string>>,
): ValidateResult {
  const errors: ValidateResult["errors"] = [];
  const eventIds = new Set<string>();

  // --- Build filterEventId → event mapping for 1:1 check ---
  const filterEventIdUsed = new Map<string, string>(); // filterEventId → evt.id
  const expectedFilterEventIds = filterEventUrlMap ? new Set(filterEventUrlMap.keys()) : null;

  // --- Validate each event ---
  for (const evt of json.events ?? []) {
    if (!evt.id) {
      errors.push({ code: "MISSING_EVENT_ID", message: `event missing id: ${evt.title}` });
    } else {
      if (eventIds.has(evt.id)) {
        errors.push({ code: "DUPLICATE_EVENT_ID", message: `duplicate event id: ${evt.id}` });
      }
      eventIds.add(evt.id);
    }
    if (!evt.eventTime || evt.eventTime === "0") {
      errors.push({ code: "MISSING_EVENT_TIME", message: `event missing eventTime: ${evt.title}` });
    }
    if (!VALID_STATUSES.has(evt.status)) {
      errors.push({ code: "INVALID_STATUS", message: `invalid status "${evt.status}" in: ${evt.title}` });
    }
    if (!VALID_UPDATE_KINDS.has(evt.updateKind)) {
      errors.push({
        code: "INVALID_UPDATE_KIND",
        message: `invalid updateKind "${evt.updateKind}" in: ${evt.title}`,
      });
    }
    // Quick fields
    if (!evt.quick?.what || !evt.quick?.why || !evt.quick?.impact) {
      errors.push({
        code: "MISSING_QUICK_FIELDS",
        message: `event missing quick.what/why/impact: ${evt.title}`,
      });
    }
    // Full fields: background, evidence, analysis, impact, action required
    const missingFull: string[] = [];
    if (!evt.full?.background) missingFull.push("background");
    if (!evt.full?.evidence) missingFull.push("evidence");
    if (!evt.full?.analysis) missingFull.push("analysis");
    if (!evt.full?.impact) missingFull.push("impact");
    if (!evt.full?.action) missingFull.push("action");
    if (missingFull.length > 0) {
      errors.push({
        code: "MISSING_FULL_FIELDS",
        message: `event missing full.${missingFull.join("/")}: ${evt.title}`,
      });
    }
    // At least one source
    if (!evt.sources || evt.sources.length === 0) {
      errors.push({ code: "MISSING_SOURCE_URL", message: `event has no sources: ${evt.title}` });
    }
    // Source URL whitelist
    for (const source of evt.sources ?? []) {
      if (!source.url) {
        errors.push({ code: "MISSING_SOURCE_URL", message: `source missing url in: ${evt.title}` });
      } else if (!candidateUrls.has(source.url)) {
        errors.push({ code: "FABRICATED_URL", message: `fabricated URL: ${source.url} (in: ${evt.title})` });
      }
    }
    // Candidate IDs
    if (!evt.candidateIds || evt.candidateIds.length === 0) {
      errors.push({ code: "MISSING_CANDIDATE_IDS", message: `event missing candidateIds: ${evt.title}` });
    }
    // candidateIds must be in the kept whitelist
    for (const cid of evt.candidateIds ?? []) {
      if (!candidateUrls.has(cid)) {
        errors.push({
          code: "FABRICATED_URL",
          message: `candidateId not in kept whitelist: ${cid} (in: ${evt.title})`,
        });
      }
    }
    // filterEventId validation: bind event to its Stage 1 source (only when map provided)
    if (filterEventUrlMap) {
      if (!evt.filterEventId) {
        errors.push({
          code: "UNKNOWN_FILTER_EVENT_ID",
          message: `event missing filterEventId: ${evt.title}`,
        });
      } else if (expectedFilterEventIds && !expectedFilterEventIds.has(evt.filterEventId)) {
        errors.push({
          code: "UNKNOWN_FILTER_EVENT_ID",
          message: `unknown filterEventId: ${evt.filterEventId} (in: ${evt.title})`,
        });
      } else {
        // Check 1:1 mapping — same filterEventId used by multiple events
        const prevEvtId = filterEventIdUsed.get(evt.filterEventId);
        if (prevEvtId && prevEvtId !== evt.id) {
          errors.push({
            code: "FILTER_EVENT_MULTI_MAPPED",
            message: `filterEventId ${evt.filterEventId} used by multiple events: ${prevEvtId} and ${evt.id}`,
          });
        } else if (!prevEvtId) {
          filterEventIdUsed.set(evt.filterEventId, evt.id);
        }
        // Check candidateIds belong to this filterEventId's URL set
        const allowedUrls = filterEventUrlMap.get(evt.filterEventId);
        if (allowedUrls) {
          for (const cid of evt.candidateIds ?? []) {
            if (!allowedUrls.has(cid)) {
              errors.push({
                code: "SOURCE_LEAKED_FROM_OTHER_FILTER_EVENT",
                message: `candidateId ${cid} does not belong to ${evt.filterEventId} (in: ${evt.title})`,
              });
            }
          }
          for (const source of evt.sources ?? []) {
            if (source.url && !allowedUrls.has(source.url)) {
              errors.push({
                code: "SOURCE_LEAKED_FROM_OTHER_FILTER_EVENT",
                message: `source ${source.url} does not belong to ${evt.filterEventId} (in: ${evt.title})`,
              });
            }
          }
        }
      }
    }
  }

  // --- Check all Stage 1 kept events are mapped to exactly one final event ---
  if (expectedFilterEventIds) {
    for (const feid of expectedFilterEventIds) {
      if (!filterEventIdUsed.has(feid)) {
        errors.push({
          code: "FILTER_EVENT_NOT_MAPPED",
          message: `Stage 1 kept event ${feid} has no corresponding final event`,
        });
      }
    }
  }

  // --- Candidate URL uniqueness: same URL must not appear in multiple events ---
  const consumedUrls = new Map<string, { eventId: string; title: string }>();
  for (const evt of json.events ?? []) {
    for (const cid of evt.candidateIds ?? []) {
      const prev = consumedUrls.get(cid);
      if (prev && prev.eventId !== evt.id) {
        errors.push({
          code: "FABRICATED_URL",
          message: `candidate URL consumed by multiple events: ${cid} (${prev.title} and ${evt.title})`,
        });
      } else if (!prev) {
        consumedUrls.set(cid, { eventId: evt.id, title: evt.title });
      }
    }
  }

  // --- Events count limit ---
  const eventsCount = (json.events ?? []).length;
  if (eventsCount > config.fullReportLimit) {
    errors.push({
      code: "EVENTS_OVER_LIMIT",
      message: `events has ${eventsCount} items, limit is ${config.fullReportLimit}`,
    });
  }

  // --- Validate fullReport references ---
  const fullReportIdList: string[] = [];
  const fullReportIds = new Set<string>();
  for (const group of json.fullReport?.topicGroups ?? []) {
    for (const id of group.eventIds ?? []) {
      fullReportIdList.push(id);
      fullReportIds.add(id);
      if (!eventIds.has(id)) {
        errors.push({
          code: "FULL_REPORT_EVENT_MISSING",
          message: `fullReport references missing event: ${id}`,
        });
      }
    }
  }

  // fullReport duplicate IDs
  const fullReportDupes = fullReportIdList.filter((id, i) => fullReportIdList.indexOf(id) !== i);
  if (fullReportDupes.length > 0) {
    errors.push({
      code: "FULL_REPORT_DUPLICATE_ID",
      message: `fullReport has duplicate eventIds: ${[...new Set(fullReportDupes)].join(", ")}`,
    });
  }

  // fullReport unique count limit
  if (fullReportIds.size > config.fullReportLimit) {
    errors.push({
      code: "EVENTS_OVER_LIMIT",
      message: `fullReport has ${fullReportIds.size} unique events, limit is ${config.fullReportLimit}`,
    });
  }

  // Orphan events: events not referenced by fullReport
  for (const evt of json.events ?? []) {
    if (!fullReportIds.has(evt.id)) {
      errors.push({
        code: "ORPHAN_EVENT",
        message: `orphan event ${evt.id} ("${evt.title}") not in fullReport`,
      });
    }
  }

  // events count must match fullReport unique count
  if (eventsCount > 0 && fullReportIds.size !== eventsCount) {
    errors.push({
      code: "EVENTS_FULLREPORT_COUNT_MISMATCH",
      message: `events count (${eventsCount}) != fullReport unique IDs (${fullReportIds.size})`,
    });
  }

  // --- Validate fiveMinuteBrief ---
  const fiveMinuteAllIds: string[] = [];
  const fiveMinuteIds = new Set<string>();
  for (const group of json.fiveMinuteBrief?.topicGroups ?? []) {
    for (const id of group.eventIds ?? []) {
      fiveMinuteAllIds.push(id);
      fiveMinuteIds.add(id);
      if (!eventIds.has(id)) {
        errors.push({
          code: "FIVE_MINUTE_EVENT_MISSING",
          message: `fiveMinuteBrief references missing event: ${id}`,
        });
      }
    }
  }

  // Detect duplicate IDs in fiveMinuteBrief (same topic or cross-topic)
  const fiveMinuteDupes = fiveMinuteAllIds.filter((id, i) => fiveMinuteAllIds.indexOf(id) !== i);
  if (fiveMinuteDupes.length > 0) {
    errors.push({
      code: "FIVE_MINUTE_DUPLICATE_ID",
      message: `fiveMinuteBrief has duplicate eventIds: ${[...new Set(fiveMinuteDupes)].join(", ")}`,
    });
  }

  // fiveMinute must be subset of fullReport
  for (const id of fiveMinuteIds) {
    if (!fullReportIds.has(id)) {
      errors.push({ code: "FIVE_MINUTE_NOT_SUBSET", message: `fiveMinute event ${id} not in fullReport` });
    }
  }

  // fiveMinute limit — count by total references, not unique set size
  if (fiveMinuteAllIds.length > config.fiveMinuteLimit) {
    errors.push({
      code: "FIVE_MINUTE_OVER_LIMIT",
      message: `fiveMinuteBrief has ${fiveMinuteAllIds.length} events, limit is ${config.fiveMinuteLimit}`,
    });
  }

  // When events exist, fiveMinuteBrief must not be empty
  if (eventsCount > 0 && fiveMinuteIds.size === 0) {
    errors.push({
      code: "EMPTY_EVENTS_WITH_TOOL_STATUS",
      message: `events has ${eventsCount} items but fiveMinuteBrief is empty`,
    });
  }

  // toolStatus must contain all primary tools
  const toolStatusKeys = new Set(Object.keys(json.toolStatus ?? {}));
  for (const tool of config.primaryTools) {
    if (!toolStatusKeys.has(tool)) {
      errors.push({ code: "TOOL_STATUS_MISSING_TOOL", message: `toolStatus missing primary tool: ${tool}` });
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Report Rendering: Markdown
// ---------------------------------------------------------------------------

function renderEventQuick(evt: ReportEvent, lang: Lang, index: number): string[] {
  const lines: string[] = [];
  lines.push(`### ${index}. ${evt.title}`);
  lines.push("");
  lines.push(`- **${lang === "zh" ? "发生了什么" : "What"}**：${evt.quick.what}`);
  lines.push(`- **${lang === "zh" ? "为什么与你有关" : "Why"}**：${evt.quick.why}`);
  lines.push(`- **${lang === "zh" ? "影响" : "Impact"}**：${evt.quick.impact}`);
  if (evt.quick.action) lines.push(`- **${lang === "zh" ? "建议行动" : "Action"}**：${evt.quick.action}`);
  lines.push(`- 🕐 ${evt.eventTime}`);
  const srcLinks = evt.sources.map((s) => `[${s.name}](${s.url})`).join(" · ");
  if (srcLinks) lines.push(`- 📎 ${srcLinks}`);
  return lines;
}

function renderEventFull(evt: ReportEvent, lang: Lang): string[] {
  const lines: string[] = [];
  lines.push(`### ${evt.title}`);
  lines.push("");
  lines.push(`- **${lang === "zh" ? "发生了什么" : "What"}**：${evt.quick.what}`);
  if (evt.full.background)
    lines.push(`- **${lang === "zh" ? "背景" : "Background"}**：${evt.full.background}`);
  if (evt.full.evidence) lines.push(`- **${lang === "zh" ? "证据" : "Evidence"}**：${evt.full.evidence}`);
  if (evt.full.analysis) lines.push(`- **${lang === "zh" ? "分析" : "Analysis"}**：${evt.full.analysis}`);
  lines.push(`- **${lang === "zh" ? "影响" : "Impact"}**：${evt.full.impact}`);
  if (evt.full.action) lines.push(`- **${lang === "zh" ? "建议行动" : "Action"}**：${evt.full.action}`);
  if (evt.full.limitations)
    lines.push(`- **${lang === "zh" ? "局限" : "Limitations"}**：${evt.full.limitations}`);
  lines.push(`- **${lang === "zh" ? "状态" : "Status"}**：${evt.status}`);
  lines.push(`- 🕐 ${evt.eventTime}`);
  const srcLinks = evt.sources.map((s) => `[${s.name}](${s.url})`).join(" · ");
  if (srcLinks) lines.push(`- 📎 ${srcLinks}`);
  if (evt.projectContext)
    lines.push(`- **${lang === "zh" ? "项目背景" : "Context"}**：${evt.projectContext}`);
  return lines;
}

export function renderPersonalReportMarkdown(
  report: PersonalReportJson,
  dateStr: string,
  lang: Lang,
): string {
  return renderMarkdown(report, dateStr, lang);
}

function renderMarkdown(report: PersonalReportJson, dateStr: string, lang: Lang): string {
  const lines: string[] = [];

  lines.push(`# ${lang === "zh" ? "AI 前沿个人简报" : "AI Frontier Personal Briefing"} ${dateStr}`);
  lines.push("");
  lines.push(`> ${lang === "zh" ? "覆盖时间" : "Coverage"}：${report.coverageFrom} ～ ${report.coverageTo}`);
  lines.push("");

  // Tool status
  lines.push(`## ${lang === "zh" ? "主力工具状态" : "Primary Tool Status"}`);
  lines.push("");
  for (const [tool, status] of Object.entries(report.toolStatus ?? {})) {
    lines.push(`- **${tool}**：${status}`);
  }
  lines.push("");

  // Build event lookup
  const eventMap = new Map<string, ReportEvent>();
  for (const evt of report.events ?? []) eventMap.set(evt.id, evt);

  // 5-minute brief
  const fiveMinuteIds: string[] = [];
  lines.push(`## ${lang === "zh" ? "五分钟概览" : "5-Minute Brief"}`);
  lines.push("");
  const fmbGroups = report.fiveMinuteBrief?.topicGroups ?? [];
  if (fmbGroups.length === 0) {
    lines.push(lang === "zh" ? "本期无重要更新。" : "No significant updates this period.");
  } else {
    let idx = 0;
    for (const group of fmbGroups) {
      if (group.name) lines.push(`### ${group.name}`);
      lines.push("");
      for (const id of group.eventIds ?? []) {
        const evt = eventMap.get(id);
        if (!evt) continue;
        fiveMinuteIds.push(id);
        idx++;
        lines.push(...renderEventQuick(evt, lang, idx));
        lines.push("");
      }
    }
  }
  lines.push("");

  // Full report — show whenever fullReport has events (full content is deeper than quick)
  const fullReportIds: string[] = [];
  for (const group of report.fullReport?.topicGroups ?? []) {
    for (const id of group.eventIds ?? []) fullReportIds.push(id);
  }

  if (fullReportIds.length > 0) {
    lines.push(`## ${lang === "zh" ? "完整报告" : "Full Report"}`);
    lines.push("");
    lines.push(
      `> ${lang === "zh" ? "继续阅读完整报告" : "Continue reading full report"}（${lang === "zh" ? "约" : "~"}${fullReportIds.length} ${lang === "zh" ? "条" : "items"}）`,
    );
    lines.push("");

    for (const group of report.fullReport?.topicGroups ?? []) {
      lines.push(`<details>`);
      lines.push(
        `<summary>${group.name}（${(group.eventIds ?? []).length} ${lang === "zh" ? "条" : "items"}）</summary>`,
      );
      lines.push("");
      for (const id of group.eventIds ?? []) {
        const evt = eventMap.get(id);
        if (!evt) continue;
        lines.push(...renderEventFull(evt, lang));
        lines.push("");
      }
      lines.push(`</details>`);
      lines.push("");
    }
  }

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
