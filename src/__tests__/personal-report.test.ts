import { describe, it, expect, vi } from "vitest";

// Mock saveFile to prevent tests from writing to disk
vi.mock("../report.ts", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../report.ts")>();
  return { ...orig, saveFile: vi.fn(() => "mock-path") };
});

import {
  extractRepoCandidates,
  extractHnCandidates,
  extractWebCandidates,
  extractTrendingCandidates,
  extractHfCandidates,
  extractPhCandidates,
  extractArxivCandidates,
  extractCommunityCandidates,
  mergeCandidates,
  selectFinalItems,
  buildBalancedPool,
  buildFilterPrompt,
  buildReportPrompt,
  buildCandidateUrlSet,
  buildKeptCandidateUrlSet,
  buildFilterEventUrlMap,
  validateReport,
  validateFilterResult,
  guardReportSchema,
  generateNoUpdateReport,
  renderPersonalReportMarkdown,
  capFilterResult,
  CATEGORY_LIMITS,
} from "../personal-report.ts";
import type {
  CandidateItem,
  MergedCandidate,
  FilterResult,
  FilterResultItem,
  PersonalReportJson,
} from "../personal-report.ts";
import type { PersonalReportConfig } from "../config.ts";
import type { RepoFetch } from "../github.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: PersonalReportConfig = {
  primaryTools: ["codex", "claude-code"],
  platforms: ["windows"],
  usageContext: "个人项目开发",
  focusTopics: ["上下文与记忆", "Agent 能力"],
  excludedTopics: ["纯 UI 细节"],
  secondaryTopics: ["GraphRAG 与知识图谱"],
  usesAnthropicAccount: false,
  usesAnthropicSubscription: false,
  modelBackend: "mimo",
  fiveMinuteLimit: 6,
  fullReportLimit: 16,
  overviewLimit: 8,
  detailLimit: 20,
  commercialMode: "exceptional_only",
  unknownProjectContext: true,
};

function makeCandidate(overrides: Partial<CandidateItem> = {}): CandidateItem {
  return {
    id: "https://example.com/item/1",
    title: "Test Item",
    subject: "Test Subject",
    summary: "A test summary",
    eventTime: "2026-07-27T08:00:00Z",
    timeEvidence: "api-date",
    sourceName: "Test Source",
    sourceUrl: "https://example.com/item/1",
    infoType: "article",
    officialConfirmed: false,
    relevanceDimensions: [],
    rawSummary: "raw data",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractHnCandidates
// ---------------------------------------------------------------------------

describe("extractHnCandidates", () => {
  it("extracts candidates from HN stories", () => {
    const data = {
      stories: [
        {
          id: "123",
          title: "AI breakthrough",
          url: "https://example.com/ai",
          hnUrl: "https://news.ycombinator.com/item?id=123",
          points: 500,
          comments: 100,
          author: "user1",
          createdAt: "2026-07-27T10:00:00Z",
        },
      ],
      fetchSuccess: true,
    };
    const result = extractHnCandidates(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("AI breakthrough");
    expect(result[0]!.infoType).toBe("discussion");
    expect(result[0]!.sourceName).toBe("Hacker News");
  });

  it("respects maxItems", () => {
    const stories = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: `Story ${i}`,
      url: `https://example.com/${i}`,
      hnUrl: `https://news.ycombinator.com/item?id=${i}`,
      points: 100 - i,
      comments: 10,
      author: "user",
      createdAt: "2026-07-27T10:00:00Z",
    }));
    const result = extractHnCandidates({ stories, fetchSuccess: true }, 3);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// extractWebCandidates
// ---------------------------------------------------------------------------

describe("extractWebCandidates", () => {
  it("extracts candidates from web fetch results", () => {
    const results = [
      {
        site: "anthropic" as const,
        siteName: "Anthropic (Claude)",
        isFirstRun: false,
        newItems: [
          {
            url: "https://anthropic.com/news/test",
            title: "Test Article",
            lastmod: "2026-07-27",
            content: "Full content here",
            site: "anthropic" as const,
            category: "news",
          },
        ],
        totalDiscovered: 100,
      },
    ];
    const result = extractWebCandidates(results);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Test Article");
    expect(result[0]!.officialConfirmed).toBe(true);
  });

  it("returns empty for no new items", () => {
    const results = [
      {
        site: "anthropic" as const,
        siteName: "Anthropic (Claude)",
        isFirstRun: false,
        newItems: [],
        totalDiscovered: 100,
      },
    ];
    expect(extractWebCandidates(results)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractTrendingCandidates
// ---------------------------------------------------------------------------

describe("extractTrendingCandidates", () => {
  it("extracts from trending and search repos", () => {
    const data = {
      trendingRepos: [
        {
          fullName: "org/repo",
          description: "A trending repo",
          language: "Python",
          todayStars: 100,
          totalStars: 5000,
          forks: 200,
          url: "https://github.com/org/repo",
        },
      ],
      searchRepos: [
        {
          fullName: "ai/agent",
          description: "AI agent",
          language: "TypeScript",
          stargazersCount: 1000,
          pushedAt: "2026-07-26",
          url: "https://github.com/ai/agent",
          searchQuery: "ai-agent",
        },
      ],
      trendingFetchSuccess: true,
      snapshotMarkers: { trendingNames: [], starCounts: {} },
    };
    const result = extractTrendingCandidates(data);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((c) => c.sourceName === "GitHub Trending")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractRepoCandidates
// ---------------------------------------------------------------------------

describe("extractRepoCandidates", () => {
  it("extracts more items for primary tools", () => {
    const fetch = {
      cfg: { id: "claude-code", repo: "anthropics/claude-code", name: "Claude Code" },
      issues: Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `Issue ${i + 1}`,
        state: "open",
        user: { login: "user" },
        labels: [],
        created_at: "2026-07-27T00:00:00Z",
        updated_at: "2026-07-27T00:00:00Z",
        comments: 5,
        reactions: { "+1": 0 },
        body: "body",
        html_url: `https://github.com/anthropics/claude-code/issues/${i + 1}`,
      })),
      prs: [],
      releases: [],
    };
    const result = extractRepoCandidates(fetch as unknown as RepoFetch, DEFAULT_CONFIG, 20);
    expect(result.length).toBeLessThanOrEqual(8); // primary tool limit
  });

  it("extracts fewer items for secondary tools", () => {
    const fetch = {
      cfg: { id: "gemini-cli", repo: "google-gemini/gemini-cli", name: "Gemini CLI" },
      issues: Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        title: `Issue ${i + 1}`,
        state: "open",
        user: { login: "user" },
        labels: [],
        created_at: "2026-07-27T00:00:00Z",
        updated_at: "2026-07-27T00:00:00Z",
        comments: 0,
        reactions: { "+1": 0 },
        body: "body",
        html_url: `https://github.com/google-gemini/gemini-cli/issues/${i + 1}`,
      })),
      prs: [],
      releases: [],
    };
    const result = extractRepoCandidates(fetch as unknown as RepoFetch, DEFAULT_CONFIG, 20);
    expect(result.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// extractHfCandidates, extractPhCandidates, extractArxivCandidates
// ---------------------------------------------------------------------------

describe("extractHfCandidates", () => {
  it("extracts model candidates", () => {
    const data = {
      models: [
        {
          id: "meta-llama/Llama-3.1-8B",
          author: "meta-llama",
          likes: 5000,
          downloads: 100000,
          tags: ["llm"],
          pipelineTag: "text-generation",
          lastModified: "2026-07-26",
          url: "https://huggingface.co/meta-llama/Llama-3.1-8B",
        },
      ],
      fetchSuccess: true,
      snapshotMarkers: { modelIds: [], likeCounts: {} },
    };
    const result = extractHfCandidates(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.infoType).toBe("model");
  });
});

describe("extractPhCandidates", () => {
  it("extracts product candidates", () => {
    const data = {
      products: [
        {
          id: "123",
          name: "AI Tool",
          tagline: "An AI tool",
          url: "https://producthunt.com/posts/ai-tool",
          website: "https://aitool.com",
          votesCount: 500,
          commentsCount: 50,
          createdAt: "2026-07-26",
          topics: ["ai"],
        },
      ],
      fetchSuccess: true,
    };
    const result = extractPhCandidates(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.infoType).toBe("product");
    expect(result[0]!.sourceUrl).toBe("https://aitool.com");
  });
});

describe("extractArxivCandidates", () => {
  it("extracts paper candidates", () => {
    const data = {
      papers: [
        {
          id: "http://arxiv.org/abs/2607.00001",
          title: "New AI Method",
          summary: "We propose a new method for...",
          authors: ["Alice", "Bob"],
          published: "2026-07-26",
          updated: "2026-07-26",
          categories: ["cs.AI"],
          url: "http://arxiv.org/abs/2607.00001",
          pdfUrl: "http://arxiv.org/pdf/2607.00001",
        },
      ],
      fetchSuccess: true,
    };
    const result = extractArxivCandidates(data);
    expect(result).toHaveLength(1);
    expect(result[0]!.infoType).toBe("paper");
    expect(result[0]!.officialConfirmed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractCommunityCandidates
// ---------------------------------------------------------------------------

describe("extractCommunityCandidates", () => {
  it("combines devto and lobsters", () => {
    const devto = {
      articles: [
        {
          id: 1,
          title: "AI article",
          description: "desc",
          url: "https://dev.to/article",
          publishedAt: "2026-07-27",
          positiveReactionsCount: 100,
          commentsCount: 20,
          readingTimeMinutes: 5,
          tags: ["ai"],
          user: "author",
        },
      ],
      fetchSuccess: true,
    };
    const lobsters = {
      stories: [
        {
          title: "ML discussion",
          url: "https://example.com/ml",
          commentsUrl: "https://lobste.rs/s/abc",
          score: 50,
          commentCount: 15,
          author: "user",
          publishedAt: "2026-07-26",
          tags: ["ai"],
        },
      ],
      fetchSuccess: true,
    };
    const result = extractCommunityCandidates(devto, lobsters);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// buildBalancedPool — Task 1: prevents source starvation
// ---------------------------------------------------------------------------

describe("buildBalancedPool", () => {
  it("includes non-GitHub sources even when GitHub dominates input", () => {
    // Create 50 GitHub candidates (more than total pool limit)
    const ghCandidates = Array.from({ length: 50 }, (_, i) =>
      makeCandidate({
        id: `https://github.com/org/repo/issues/${i}`,
        title: `GitHub Issue #${i}`,
        subject: i < 16 ? "Codex" : i < 32 ? "Claude Code" : "Gemini CLI",
        sourceName: "GitHub",
        sourceUrl: `https://github.com/org/repo/issues/${i}`,
        eventTime: `2026-07-27T${String(i % 24).padStart(2, "0")}:00:00Z`,
      }),
    );

    // Add non-GitHub sources
    const hnCandidates = [
      makeCandidate({
        id: "https://news.ycombinator.com/item?id=100",
        title: "Important HN Discussion",
        sourceName: "Hacker News",
        sourceUrl: "https://example.com/important-ai-news",
        subject: "AI News",
      }),
    ];
    const webCandidates = [
      makeCandidate({
        id: "https://openai.com/blog/new-model",
        title: "OpenAI New Model Announcement",
        sourceName: "OpenAI",
        sourceUrl: "https://openai.com/blog/new-model",
        subject: "OpenAI",
        officialConfirmed: true,
      }),
    ];
    const arxivCandidates = [
      makeCandidate({
        id: "http://arxiv.org/abs/2607.00001",
        title: "Important Paper",
        sourceName: "ArXiv",
        sourceUrl: "http://arxiv.org/abs/2607.00001",
        subject: "research",
        infoType: "paper",
      }),
    ];

    const all = [...ghCandidates, ...hnCandidates, ...webCandidates, ...arxivCandidates];
    const pool = buildBalancedPool(all, DEFAULT_CONFIG);

    // Check that non-GitHub sources are represented
    const sourceNames = pool.map((c) => c.sourceName);
    expect(sourceNames).toContain("Hacker News");
    expect(sourceNames).toContain("ArXiv");
    // OpenAI web might be categorized as "webOpenai" but still present
    expect(pool.some((c) => c.sourceUrl.includes("openai.com"))).toBe(true);
  });

  it("respects per-source category limits", () => {
    // Create many candidates for one category
    const codexCandidates = Array.from({ length: 20 }, (_, i) =>
      makeCandidate({
        id: `https://github.com/openai/codex/issues/${i}`,
        subject: "OpenAI Codex",
        sourceUrl: `https://github.com/openai/codex/issues/${i}`,
      }),
    );

    const pool = buildBalancedPool(codexCandidates, DEFAULT_CONFIG);
    const codexCount = pool.filter((c) => c.subject.includes("Codex")).length;
    expect(codexCount).toBeLessThanOrEqual(CATEGORY_LIMITS.codex);
  });

  it("interleaves sources rather than sequential ordering", () => {
    const sources = [
      makeCandidate({ id: "a1", sourceName: "GitHub", subject: "Codex", sourceUrl: "https://gh/a1" }),
      makeCandidate({ id: "a2", sourceName: "GitHub", subject: "Codex", sourceUrl: "https://gh/a2" }),
      makeCandidate({ id: "a3", sourceName: "GitHub", subject: "Codex", sourceUrl: "https://gh/a3" }),
      makeCandidate({ id: "b1", sourceName: "Hacker News", sourceUrl: "https://hn/b1", subject: "HN" }),
      makeCandidate({
        id: "c1",
        sourceName: "ArXiv",
        sourceUrl: "https://arxiv/c1",
        subject: "Research",
        infoType: "paper",
      }),
    ];

    const pool = buildBalancedPool(sources, DEFAULT_CONFIG);
    // The pool should interleave: first GitHub, then HN, then ArXiv, then GitHub...
    // So the first 3 should not all be GitHub
    const firstThreeSources = pool.slice(0, 3).map((c) => c.sourceName);
    const allGitHub = firstThreeSources.every((s) => s === "GitHub");
    expect(allGitHub).toBe(false);
  });

  it("returns empty for empty input", () => {
    expect(buildBalancedPool([], DEFAULT_CONFIG)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// mergeCandidates
// ---------------------------------------------------------------------------

describe("mergeCandidates", () => {
  it("deduplicates by URL", () => {
    const candidates = [
      makeCandidate({ id: "a", sourceUrl: "https://example.com/item/1", sourceName: "GitHub" }),
      makeCandidate({ id: "b", sourceUrl: "https://example.com/item/1", sourceName: "HN" }),
    ];
    const result = mergeCandidates(candidates);
    expect(result).toHaveLength(1);
    expect(result[0]!.additionalSources).toHaveLength(0);
  });

  it("deduplicates and tracks different source URLs for same item", () => {
    const candidates = [
      makeCandidate({ id: "a", sourceUrl: "https://example.com/item/1", sourceName: "GitHub" }),
      makeCandidate({ id: "b", sourceUrl: "https://news.ycombinator.com/item?id=123", sourceName: "HN" }),
    ];
    const result = mergeCandidates(candidates);
    expect(result).toHaveLength(2);
  });

  it("preserves distinct items", () => {
    const candidates = [
      makeCandidate({ id: "a", sourceUrl: "https://example.com/item/1" }),
      makeCandidate({ id: "b", sourceUrl: "https://example.com/item/2" }),
    ];
    const result = mergeCandidates(candidates);
    expect(result).toHaveLength(2);
  });

  it("prefers official-confirmed items on merge", () => {
    const candidates = [
      makeCandidate({
        id: "a",
        sourceUrl: "https://example.com/item/1",
        officialConfirmed: false,
        summary: "community summary",
      }),
      makeCandidate({
        id: "b",
        sourceUrl: "https://example.com/item/1",
        officialConfirmed: true,
        summary: "official summary",
      }),
    ];
    const result = mergeCandidates(candidates);
    expect(result).toHaveLength(1);
    expect(result[0]!.officialConfirmed).toBe(true);
    expect(result[0]!.summary).toBe("official summary");
  });

  it("returns empty for empty input", () => {
    expect(mergeCandidates([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// selectFinalItems
// ---------------------------------------------------------------------------

describe("selectFinalItems", () => {
  it("caps items at limit", () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeCandidate({ id: `item-${i}`, sourceUrl: `https://example.com/${i}` }),
    );
    const merged = mergeCandidates(items);
    const result = selectFinalItems(merged, 20);
    expect(result).toHaveLength(20);
  });

  it("returns all when under limit", () => {
    const items = [makeCandidate()];
    const merged = mergeCandidates(items);
    expect(selectFinalItems(merged, 20)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// buildFilterPrompt
// ---------------------------------------------------------------------------

describe("buildFilterPrompt", () => {
  it("includes candidate details in filter prompt", () => {
    const candidates: MergedCandidate[] = [
      { ...makeCandidate({ title: "New Feature X", subject: "Claude Code" }), additionalSources: [] },
    ];
    const prompt = buildFilterPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("New Feature X");
    expect(prompt).toContain("Claude Code");
    expect(prompt).toContain("codex");
    expect(prompt).toContain("claude-code");
  });

  it("includes filter rules", () => {
    const candidates: MergedCandidate[] = [];
    const prompt = buildFilterPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("模糊投诉");
    expect(prompt).toContain("纯 UI");
    expect(prompt).toContain("宁缺毋滥");
    expect(prompt).toContain("20");
  });
});

// ---------------------------------------------------------------------------
// buildReportPrompt
// ---------------------------------------------------------------------------

describe("buildReportPrompt", () => {
  it("includes filtered events with full context", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          title: "Claude Code Memory",
          subject: "Claude Code",
          sourceUrl: "https://github.com/anthropics/claude-code/pull/1",
        }),
        additionalSources: ["https://openai.com/blog/x"],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Claude Code Memory Feature",
          keepIds: ["https://example.com/item/1"], // This matches makeCandidate's default id
          mergedIds: [],
          topic: "Memory",
          relevance: "High",
          confidence: "high",
          reason: "Direct feature",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const prompt = buildReportPrompt(candidates, filterResult, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("Claude Code Memory Feature");
    expect(prompt).toContain("evt-N");
    expect(prompt).toContain("updateKind");
  });
});

// ---------------------------------------------------------------------------
// validateReport — strict JSON validation
// ---------------------------------------------------------------------------

describe("validateReport", () => {
  const VALID_JSON: PersonalReportJson = {
    generatedAt: "2026-07-27T08:00:00Z",
    coverageFrom: "2026-07-23T08:00:00Z",
    coverageTo: "2026-07-27T08:00:00Z",
    toolStatus: { codex: "ok", "claude-code": "ok" },
    events: [
      {
        id: "evt-1",
        title: "Item 1",
        topic: "Topic 1",
        eventTime: "2026-07-27T08:00:00Z",
        updateKind: "new",
        status: "已确认",
        quick: { what: "Something happened", why: "It affects you", impact: "High impact" },
        full: {
          background: "Context info",
          evidence: "Release notes",
          analysis: "Technical details",
          impact: "Significant change",
          action: "Upgrade now",
        },
        candidateIds: ["https://example.com/1"],
        sources: [{ name: "GitHub", url: "https://example.com/1" }],
      },
    ],
    fiveMinuteBrief: {
      topicGroups: [{ name: "Topic 1", eventIds: ["evt-1"] }],
    },
    fullReport: {
      topicGroups: [{ name: "Topic 1", eventIds: ["evt-1"] }],
    },
  };

  const VALID_URLS = new Set(["https://example.com/1"]);

  it("passes for valid report", () => {
    const result = validateReport(VALID_JSON, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects fabricated URLs", () => {
    const json = structuredClone(VALID_JSON);
    json.events[0]!.sources = [{ name: "Fake", url: "https://fake-url.com/1" }];
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FABRICATED_URL")).toBe(true);
  });

  it("rejects missing eventTime", () => {
    const json = structuredClone(VALID_JSON);
    json.events[0]!.eventTime = "";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_EVENT_TIME")).toBe(true);
  });

  it("rejects zero eventTime", () => {
    const json = structuredClone(VALID_JSON);
    json.events[0]!.eventTime = "0";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_EVENT_TIME")).toBe(true);
  });

  it("rejects invalid status", () => {
    const json = structuredClone(VALID_JSON);
    json.events[0]!.status = "invalid" as "已确认";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_STATUS")).toBe(true);
  });

  it("rejects invalid updateKind", () => {
    const json = structuredClone(VALID_JSON);
    json.events[0]!.updateKind = "invalid" as "new";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_UPDATE_KIND")).toBe(true);
  });

  it("rejects when fiveMinuteBrief exceeds limit", () => {
    const json = structuredClone(VALID_JSON);
    const lowLimitConfig = { ...DEFAULT_CONFIG, fiveMinuteLimit: 1 };
    // Add more events than the limit allows
    json.events.push({
      id: "evt-2",
      title: "Item 2",
      topic: "Topic 2",
      eventTime: "2026-07-27T09:00:00Z",
      updateKind: "new",
      status: "已确认",
      quick: { what: "Another thing", why: "Also matters", impact: "Medium impact" },
      full: {
        background: "Context",
        evidence: "Source",
        analysis: "Details",
        impact: "Some change",
        action: "Monitor",
      },
      candidateIds: ["https://example.com/2"],
      sources: [{ name: "GitHub", url: "https://example.com/2" }],
    });
    const validUrls = new Set(["https://example.com/1", "https://example.com/2"]);
    json.fiveMinuteBrief = {
      topicGroups: [
        { name: "Topic 1", eventIds: ["evt-1"] },
        { name: "Topic 2", eventIds: ["evt-2"] },
      ],
    };
    json.fullReport = {
      topicGroups: [
        { name: "Topic 1", eventIds: ["evt-1"] },
        { name: "Topic 2", eventIds: ["evt-2"] },
      ],
    };
    const result = validateReport(json, lowLimitConfig, validUrls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FIVE_MINUTE_OVER_LIMIT")).toBe(true);
  });

  it("rejects when fullReport references non-existent event", () => {
    const json = structuredClone(VALID_JSON);
    json.fullReport = {
      topicGroups: [{ name: "Ghost Topic", eventIds: ["evt-nonexistent"] }],
    };
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FULL_REPORT_EVENT_MISSING")).toBe(true);
  });

  it("rejects when fiveMinuteBrief references non-existent event", () => {
    const json = structuredClone(VALID_JSON);
    json.fiveMinuteBrief = {
      topicGroups: [{ name: "Ghost Topic", eventIds: ["evt-nonexistent"] }],
    };
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FIVE_MINUTE_EVENT_MISSING")).toBe(true);
  });

  it("rejects when toolStatus missing primary tool", () => {
    const json = structuredClone(VALID_JSON);
    json.toolStatus = { codex: "ok" }; // missing claude-code
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "TOOL_STATUS_MISSING_TOOL")).toBe(true);
  });

  it("rejects missing candidateIds", () => {
    const json = structuredClone(VALID_JSON);
    json.events[0]!.candidateIds = [];
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_CANDIDATE_IDS")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildCandidateUrlSet
// ---------------------------------------------------------------------------

describe("buildCandidateUrlSet", () => {
  it("includes sourceUrl and additionalSources", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({ sourceUrl: "https://github.com/a" }),
        additionalSources: ["https://news.ycombinator.com/item?id=1"],
      },
    ];
    const urls = buildCandidateUrlSet(candidates);
    expect(urls.has("https://github.com/a")).toBe(true);
    expect(urls.has("https://news.ycombinator.com/item?id=1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateNoUpdateReport
// ---------------------------------------------------------------------------

describe("generateNoUpdateReport", () => {
  it("generates report with empty events and toolStatus for all primary tools", () => {
    const { json } = generateNoUpdateReport(
      DEFAULT_CONFIG,
      "2026-07-23T00:00:00Z",
      "2026-07-27T00:00:00Z",
      "2026-07-27",
      "zh",
    );
    expect(json.events).toHaveLength(0);
    expect(json.fiveMinuteBrief.topicGroups).toHaveLength(0);
    expect(json.fullReport.topicGroups).toHaveLength(0);
    expect(json.toolStatus["codex"]).toBe("本期无重要更新");
    expect(json.toolStatus["claude-code"]).toBe("本期无重要更新");
  });
});

// ---------------------------------------------------------------------------
// Events structure — quick.what + quick.why fields
// ---------------------------------------------------------------------------

describe("events structure", () => {
  it("PersonalReportJson events have quick.what and quick.why fields", () => {
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [
        {
          id: "evt-1",
          title: "Test Event",
          topic: "Test Topic",
          eventTime: "2026-07-27T08:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "Something happened", why: "It matters to you", impact: "High" },
          full: {
            background: "Context",
            evidence: "Source",
            analysis: "Details",
            impact: "Significant",
            action: "Act",
          },
          candidateIds: ["https://example.com/1"],
          sources: [{ name: "GitHub", url: "https://example.com/1" }],
        },
      ],
      fiveMinuteBrief: { topicGroups: [{ name: "Test Topic", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "Test Topic", eventIds: ["evt-1"] }] },
    };
    expect(json.events[0]!.quick.what).toBe("Something happened");
    expect(json.events[0]!.quick.why).toBe("It matters to you");
  });

  it("buildReportPrompt instructs LLM to output what and why", () => {
    const candidates: MergedCandidate[] = [];
    const filterResult: FilterResult = { kept: [], excluded: [] };
    const prompt = buildReportPrompt(candidates, filterResult, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain('"what"');
    expect(prompt).toContain('"why"');
    expect(prompt).not.toContain('"summary"');
  });
});

// ---------------------------------------------------------------------------
// Config loading — real config.yml
// ---------------------------------------------------------------------------

describe("config.yml loading", () => {
  it("loads real config.yml with new user profile", async () => {
    const { loadConfig } = await import("../config.ts");
    const config = loadConfig("config.yml");
    expect(config.personalReport.modelBackend).toBe("mimo");
    expect(config.personalReport.usesAnthropicAccount).toBe(false);
    expect(config.personalReport.usesAnthropicSubscription).toBe(false);
    expect(config.personalReport.fiveMinuteLimit).toBe(6);
    expect(config.personalReport.fullReportLimit).toBe(16);
    expect(config.personalReport.focusTopics).toContain("RAG 与实际项目知识库");
    expect(config.personalReport.focusTopics).toContain("Agent 长期记忆、状态数据库和跨会话记忆");
    expect(config.personalReport.secondaryTopics).toContain("GraphRAG 与知识图谱");
    expect(config.personalReport.usageContext).toContain("智能诊断");
  });
});

// ---------------------------------------------------------------------------
// Validation — new error codes and full field requirements
// ---------------------------------------------------------------------------

describe("validateReport — strengthened rules", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeValidEvent(overrides: Record<string, unknown> = {}): any {
    return {
      id: "evt-1",
      title: "Test Event",
      topic: "Topic",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "new",
      status: "已确认",
      quick: { what: "what", why: "why", impact: "impact" },
      full: { background: "bg", evidence: "ev", analysis: "an", impact: "imp", action: "act" },
      candidateIds: ["https://example.com/1"],
      sources: [{ name: "GitHub", url: "https://example.com/1" }],
      ...overrides,
    };
  }

  function makeValidJson(eventOverrides: Record<string, unknown> = {}): PersonalReportJson {
    const evt = makeValidEvent(eventOverrides);
    return {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [evt],
      fiveMinuteBrief: { topicGroups: [{ name: "Topic", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "Topic", eventIds: ["evt-1"] }] },
    };
  }

  const VALID_URLS = new Set(["https://example.com/1"]);

  it("rejects when full.background is missing", () => {
    const json = makeValidJson({ full: { evidence: "ev", analysis: "an", impact: "imp", action: "act" } });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_FULL_FIELDS")).toBe(true);
  });

  it("rejects when full.evidence is missing", () => {
    const json = makeValidJson({ full: { background: "bg", analysis: "an", impact: "imp", action: "act" } });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_FULL_FIELDS")).toBe(true);
  });

  it("rejects when full.action is missing", () => {
    const json = makeValidJson({ full: { background: "bg", evidence: "ev", analysis: "an", impact: "imp" } });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_FULL_FIELDS")).toBe(true);
  });

  it("rejects when full.analysis is missing", () => {
    const json = makeValidJson({ full: { background: "bg", evidence: "ev", impact: "imp", action: "act" } });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_FULL_FIELDS")).toBe(true);
  });

  it("rejects when full.impact is missing", () => {
    const json = makeValidJson({ full: { background: "bg", evidence: "ev", analysis: "an", action: "act" } });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_FULL_FIELDS")).toBe(true);
  });

  it("rejects orphan events not referenced by fullReport", () => {
    const json = makeValidJson();
    json.events.push(makeValidEvent({ id: "evt-orphan", title: "Orphan" }));
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "ORPHAN_EVENT")).toBe(true);
  });

  it("rejects fullReport duplicate IDs", () => {
    const json = makeValidJson();
    json.fullReport.topicGroups.push({ name: "Dup", eventIds: ["evt-1"] });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FULL_REPORT_DUPLICATE_ID")).toBe(true);
  });

  it("rejects events count exceeding fullReportLimit", () => {
    const config = { ...DEFAULT_CONFIG, fullReportLimit: 2 };
    const events = [1, 2, 3].map((i) => makeValidEvent({ id: `evt-${i}`, title: `E${i}` }));
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: events,
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1", "evt-2", "evt-3"] }] },
    };
    const result = validateReport(json, config, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "EVENTS_OVER_LIMIT")).toBe(true);
  });

  it("allows fewer than fullReportLimit when insufficient value", () => {
    const config = { ...DEFAULT_CONFIG, fullReportLimit: 16 };
    const json = makeValidJson();
    const result = validateReport(json, config, VALID_URLS);
    expect(result.ok).toBe(true);
  });

  it("rejects event with no sources", () => {
    const json = makeValidJson({ sources: [] });
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_SOURCE_URL")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildFilterPrompt — includes new user profile fields
// ---------------------------------------------------------------------------

describe("buildFilterPrompt — user profile", () => {
  it("includes modelBackend and usesAnthropicSubscription in prompt", () => {
    const candidates: MergedCandidate[] = [];
    const prompt = buildFilterPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("mimo");
    expect(prompt).toContain("否"); // usesAnthropicSubscription: false
    expect(prompt).toContain("16"); // fullReportLimit
  });

  it("includes focusTopics and secondaryTopics", () => {
    const candidates: MergedCandidate[] = [];
    const prompt = buildFilterPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("上下文与记忆");
    expect(prompt).toContain("GraphRAG");
  });

  it("uses fullReportLimit not detailLimit for cap", () => {
    const config = { ...DEFAULT_CONFIG, fullReportLimit: 16, detailLimit: 20 };
    const candidates: MergedCandidate[] = [];
    const prompt = buildFilterPrompt(candidates, config, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("最多保留 16");
    expect(prompt).not.toContain("最多保留 20");
  });
});

// ---------------------------------------------------------------------------
// renderPersonalReportMarkdown — full report always visible
// ---------------------------------------------------------------------------

describe("renderPersonalReportMarkdown", () => {
  const VALID_JSON: PersonalReportJson = {
    generatedAt: "2026-07-27T08:00:00Z",
    coverageFrom: "2026-07-23T08:00:00Z",
    coverageTo: "2026-07-27T08:00:00Z",
    toolStatus: { codex: "ok", "claude-code": "ok" },
    events: [
      {
        id: "evt-1",
        title: "Test Event",
        topic: "Topic A",
        eventTime: "2026-07-27T08:00:00Z",
        updateKind: "new",
        status: "已确认",
        quick: { what: "quick what", why: "quick why", impact: "quick impact", action: "quick action" },
        full: {
          background: "full bg",
          evidence: "full ev",
          analysis: "full an",
          impact: "full imp",
          action: "full act",
        },
        candidateIds: ["https://example.com/1"],
        sources: [{ name: "GitHub", url: "https://example.com/1" }],
      },
    ],
    fiveMinuteBrief: { topicGroups: [{ name: "Topic A", eventIds: ["evt-1"] }] },
    fullReport: { topicGroups: [{ name: "Topic A", eventIds: ["evt-1"] }] },
  };

  it("shows full report even when fiveMinute and fullReport reference same events", () => {
    const md = renderPersonalReportMarkdown(VALID_JSON, "2026-07-27", "zh");
    expect(md).toContain("完整报告");
    expect(md).toContain("继续阅读完整报告");
    expect(md).toContain("<details>");
    expect(md).toContain("full bg");
    expect(md).toContain("full ev");
    expect(md).toContain("full an");
    expect(md).toContain("full act");
  });

  it("hides full report for no-update report", () => {
    const noUpdate: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "无更新", "claude-code": "无更新" },
      events: [],
      fiveMinuteBrief: { topicGroups: [] },
      fullReport: { topicGroups: [] },
    };
    const md = renderPersonalReportMarkdown(noUpdate, "2026-07-27", "zh");
    expect(md).not.toContain("完整报告");
    expect(md).not.toContain("继续阅读");
    expect(md).not.toContain("<details>");
  });
});

// ---------------------------------------------------------------------------
// capFilterResult — deterministic 18→16 truncation
// ---------------------------------------------------------------------------

describe("capFilterResult", () => {
  function makeFilterResult(count: number): FilterResult {
    return {
      kept: Array.from({ length: count }, (_, i) => ({
        title: `Event ${i + 1}`,
        keepIds: [`${i + 1}`],
        mergedIds: [],
        topic: "T",
        relevance: "R",
        confidence: "high" as const,
        reason: "R",
        needsContext: false,
      })),
      excluded: [{ id: "99", reason: "low value" }],
    };
  }

  it("18 items capped to 16", () => {
    const result = capFilterResult(makeFilterResult(18), 16);
    expect(result.kept).toHaveLength(16);
  });

  it("preserves original ordering (keeps first 16)", () => {
    const result = capFilterResult(makeFilterResult(18), 16);
    expect(result.kept[0]!.title).toBe("Event 1");
    expect(result.kept[15]!.title).toBe("Event 16");
  });

  it("10 items remain 10 (no padding)", () => {
    const result = capFilterResult(makeFilterResult(10), 16);
    expect(result.kept).toHaveLength(10);
  });

  it("does not mutate input", () => {
    const input = makeFilterResult(18);
    const originalLen = input.kept.length;
    capFilterResult(input, 16);
    expect(input.kept).toHaveLength(originalLen);
  });

  it("preserves excluded data", () => {
    const result = capFilterResult(makeFilterResult(18), 16);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0]!.reason).toBe("low value");
  });

  it("uses config value not hardcoded", () => {
    const result = capFilterResult(makeFilterResult(20), 16);
    expect(result.kept).toHaveLength(16);
    const result2 = capFilterResult(makeFilterResult(20), 8);
    expect(result2.kept).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// Prompt — required full fields, no 可选
// ---------------------------------------------------------------------------

describe("buildReportPrompt — full fields required", () => {
  it("does not contain 可选 for background/evidence/analysis/action", () => {
    const candidates: MergedCandidate[] = [];
    const filterResult: FilterResult = { kept: [], excluded: [] };
    const prompt = buildReportPrompt(candidates, filterResult, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).not.toContain("background（可选）");
    expect(prompt).not.toContain("evidence（可选）");
    expect(prompt).not.toContain("analysis（可选）");
    expect(prompt).not.toContain("action（可选）");
    expect(prompt).toContain("limitations（选填局限）");
  });

  it("explicitly states full fields must be non-empty", () => {
    const candidates: MergedCandidate[] = [];
    const filterResult: FilterResult = { kept: [], excluded: [] };
    const prompt = buildReportPrompt(candidates, filterResult, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("必须非空");
  });
});

// ---------------------------------------------------------------------------
// validateFilterResult — Stage 1 integrity
// ---------------------------------------------------------------------------

describe("validateFilterResult", () => {
  function makeKept(overrides: Partial<FilterResultItem> = {}): FilterResultItem {
    return {
      title: "Event",
      keepIds: ["1"],
      mergedIds: [],
      topic: "T",
      relevance: "R",
      confidence: "high",
      reason: "R",
      needsContext: false,
      ...overrides,
    };
  }

  it("passes for valid filter result", () => {
    const result = validateFilterResult({ kept: [makeKept()], excluded: [] }, 5);
    expect(result.ok).toBe(true);
  });

  it("rejects invalid candidate ID (out of range)", () => {
    const result = validateFilterResult({ kept: [makeKept({ keepIds: ["99"] })], excluded: [] }, 5);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe("FILTER_INVALID_CANDIDATE_ID");
  });

  it("rejects kept and excluded overlap", () => {
    const result = validateFilterResult(
      { kept: [makeKept({ keepIds: ["2"] })], excluded: [{ id: "2", reason: "low" }] },
      5,
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe("FILTER_KEPT_EXCLUDED_OVERLAP");
  });

  it("rejects same candidate assigned to multiple kept events", () => {
    const kept = [
      makeKept({ title: "A", keepIds: ["1", "2"] }),
      makeKept({ title: "B", keepIds: ["2", "3"] }),
    ];
    const result = validateFilterResult({ kept, excluded: [] }, 5);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code).toBe("FILTER_DUPLICATE_CANDIDATE_ASSIGNMENT");
  });
});

// ---------------------------------------------------------------------------
// buildKeptCandidateUrlSet — narrowed whitelist
// ---------------------------------------------------------------------------

describe("buildKeptCandidateUrlSet", () => {
  function mkKept(overrides: Partial<FilterResultItem> = {}): FilterResultItem {
    return {
      title: "Event",
      keepIds: ["1"],
      mergedIds: [],
      topic: "T",
      relevance: "R",
      confidence: "high",
      reason: "R",
      needsContext: false,
      ...overrides,
    };
  }

  it("only includes URLs from kept candidates", () => {
    const candidates: MergedCandidate[] = [
      { ...makeCandidate({ id: "a", sourceUrl: "https://kept.com/1" }), additionalSources: [] },
      { ...makeCandidate({ id: "b", sourceUrl: "https://excluded.com/2" }), additionalSources: [] },
      { ...makeCandidate({ id: "c", sourceUrl: "https://kept.com/3" }), additionalSources: [] },
    ];
    const filterResult: FilterResult = {
      kept: [mkKept({ keepIds: ["1"], mergedIds: ["3"] })],
      excluded: [{ id: "2", reason: "low" }],
    };
    const urls = buildKeptCandidateUrlSet(candidates, filterResult);
    expect(urls.has("https://kept.com/1")).toBe(true);
    expect(urls.has("https://kept.com/3")).toBe(true);
    expect(urls.has("https://excluded.com/2")).toBe(false);
  });

  it("includes additionalSources of kept candidates", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({ id: "a", sourceUrl: "https://primary.com/1" }),
        additionalSources: ["https://extra.com/1"],
      },
    ];
    const filterResult: FilterResult = {
      kept: [mkKept({ keepIds: ["1"] })],
      excluded: [],
    };
    const urls = buildKeptCandidateUrlSet(candidates, filterResult);
    expect(urls.has("https://primary.com/1")).toBe(true);
    expect(urls.has("https://extra.com/1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateReport — candidate URL uniqueness
// ---------------------------------------------------------------------------

describe("validateReport — candidate URL uniqueness", () => {
  it("rejects candidate URL consumed by multiple events", () => {
    const sharedUrl = "https://example.com/shared";
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [
        {
          id: "evt-1",
          title: "Event A",
          topic: "T",
          eventTime: "2026-07-27T08:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: [sharedUrl],
          sources: [{ name: "S", url: sharedUrl }],
        },
        {
          id: "evt-2",
          title: "Event B",
          topic: "T",
          eventTime: "2026-07-27T09:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: [sharedUrl],
          sources: [{ name: "S", url: sharedUrl }],
        },
      ],
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1", "evt-2"] }] },
    };
    const urls = new Set([sharedUrl]);
    const result = validateReport(json, DEFAULT_CONFIG, urls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("multiple events"))).toBe(true);
  });

  it("rejects candidateId not in kept whitelist", () => {
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [
        {
          id: "evt-1",
          title: "Event",
          topic: "T",
          eventTime: "2026-07-27T08:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: ["https://excluded-candidate.com/1"],
          sources: [{ name: "S", url: "https://kept.com/1" }],
        },
      ],
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
    };
    const urls = new Set(["https://kept.com/1"]);
    const result = validateReport(json, DEFAULT_CONFIG, urls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("kept whitelist"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// guardReportSchema — generatedAt validation
// ---------------------------------------------------------------------------

describe("guardReportSchema — generatedAt", () => {
  const VALID_BASE = {
    events: [],
    toolStatus: { codex: "ok", "claude-code": "ok" },
    fiveMinuteBrief: { topicGroups: [] },
    fullReport: { topicGroups: [] },
    coverageFrom: "2026-07-23T00:00:00Z",
    coverageTo: "2026-07-27T00:00:00Z",
  };

  it("rejects when generatedAt is missing", () => {
    const result = guardReportSchema(VALID_BASE);
    expect(result).not.toBeNull();
    expect(result).toContain("generatedAt");
  });

  it("rejects when generatedAt is empty string", () => {
    const result = guardReportSchema({ ...VALID_BASE, generatedAt: "" });
    expect(result).not.toBeNull();
    expect(result).toContain("generatedAt");
  });

  it("rejects when generatedAt is not valid ISO-8601", () => {
    const result = guardReportSchema({ ...VALID_BASE, generatedAt: "not-a-date" });
    expect(result).not.toBeNull();
    expect(result).toContain("generatedAt");
  });

  it("accepts valid ISO-8601 generatedAt", () => {
    const result = guardReportSchema({ ...VALID_BASE, generatedAt: "2026-07-27T08:00:00Z" });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateFilterResult — ID normalization
// ---------------------------------------------------------------------------

describe("validateFilterResult — ID normalization", () => {
  function makeKept(overrides: Partial<FilterResultItem> = {}): FilterResultItem {
    return {
      title: "Event",
      keepIds: ["1"],
      mergedIds: [],
      topic: "T",
      relevance: "R",
      confidence: "high",
      reason: "R",
      needsContext: false,
      ...overrides,
    };
  }

  it('"01" is rejected as invalid (leading zero), not silently normalized', () => {
    const result = validateFilterResult(
      { kept: [makeKept({ keepIds: ["01"] })], excluded: [{ id: "1", reason: "low" }] },
      5,
    );
    // "01" has leading zero → rejected as invalid
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FILTER_INVALID_CANDIDATE_ID")).toBe(true);
  });

  it("number 1 and string '1' are the same candidate", () => {
    const result = validateFilterResult(
      { kept: [makeKept({ keepIds: ["1"] })], excluded: [{ id: 1 as unknown as string, reason: "low" }] },
      5,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FILTER_KEPT_EXCLUDED_OVERLAP")).toBe(true);
  });

  it("rejects invalid excluded ID", () => {
    const result = validateFilterResult({ kept: [makeKept()], excluded: [{ id: "abc", reason: "low" }] }, 5);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FILTER_INVALID_CANDIDATE_ID")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateReport — URL uniqueness uses evt.id not title
// ---------------------------------------------------------------------------

describe("validateReport — URL uniqueness by event ID", () => {
  it("detects duplicate URL across events with same title but different IDs", () => {
    const sharedUrl = "https://example.com/shared";
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [
        {
          id: "evt-1",
          title: "Same Title",
          topic: "T",
          eventTime: "2026-07-27T08:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: [sharedUrl],
          sources: [{ name: "S", url: sharedUrl }],
        },
        {
          id: "evt-2",
          title: "Same Title",
          topic: "T",
          eventTime: "2026-07-27T09:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: [sharedUrl],
          sources: [{ name: "S", url: sharedUrl }],
        },
      ],
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1", "evt-2"] }] },
    };
    const urls = new Set([sharedUrl]);
    const result = validateReport(json, DEFAULT_CONFIG, urls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.message.includes("multiple events"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterEventId binding — per-event URL validation
// ---------------------------------------------------------------------------

describe("validateReport — filterEventId binding", () => {
  function makeEvent(
    id: string,
    filterEventId: string,
    candidateIds: string[],
    sources: Array<{ name: string; url: string }>,
  ) {
    return {
      filterEventId,
      id,
      title: `Event ${id}`,
      topic: "T",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "new" as const,
      status: "已确认" as const,
      quick: { what: "w", why: "y", impact: "i", action: "a" },
      full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
      candidateIds,
      sources,
    };
  }

  function makeJson(events: ReturnType<typeof makeEvent>[]): PersonalReportJson {
    return {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events,
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: events.map((e) => e.id) }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: events.map((e) => e.id) }] },
    };
  }

  const filterEventUrlMap = new Map([
    ["filter-event-1", new Set(["https://url-a.com/1"])],
    ["filter-event-2", new Set(["https://url-b.com/2"])],
  ]);

  it("passes when events correctly use their own filterEventId URLs", () => {
    const json = makeJson([
      makeEvent(
        "evt-1",
        "filter-event-1",
        ["https://url-a.com/1"],
        [{ name: "A", url: "https://url-a.com/1" }],
      ),
      makeEvent(
        "evt-2",
        "filter-event-2",
        ["https://url-b.com/2"],
        [{ name: "B", url: "https://url-b.com/2" }],
      ),
    ]);
    const allUrls = new Set(["https://url-a.com/1", "https://url-b.com/2"]);
    const result = validateReport(json, DEFAULT_CONFIG, allUrls, filterEventUrlMap);
    expect(result.ok).toBe(true);
  });

  it("fails when events swap URLs (A uses B's URL)", () => {
    const json = makeJson([
      makeEvent(
        "evt-1",
        "filter-event-1",
        ["https://url-b.com/2"],
        [{ name: "B", url: "https://url-b.com/2" }],
      ),
      makeEvent(
        "evt-2",
        "filter-event-2",
        ["https://url-a.com/1"],
        [{ name: "A", url: "https://url-a.com/1" }],
      ),
    ]);
    const allUrls = new Set(["https://url-a.com/1", "https://url-b.com/2"]);
    const result = validateReport(json, DEFAULT_CONFIG, allUrls, filterEventUrlMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "SOURCE_LEAKED_FROM_OTHER_FILTER_EVENT")).toBe(true);
  });

  it("fails when one filterEventId is used by two final events", () => {
    const json = makeJson([
      makeEvent(
        "evt-1",
        "filter-event-1",
        ["https://url-a.com/1"],
        [{ name: "A", url: "https://url-a.com/1" }],
      ),
      makeEvent(
        "evt-2",
        "filter-event-1",
        ["https://url-a.com/1"],
        [{ name: "A", url: "https://url-a.com/1" }],
      ),
    ]);
    const allUrls = new Set(["https://url-a.com/1"]);
    const result = validateReport(json, DEFAULT_CONFIG, allUrls, filterEventUrlMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FILTER_EVENT_MULTI_MAPPED")).toBe(true);
  });

  it("fails when a kept filterEventId has no corresponding final event", () => {
    const json = makeJson([
      makeEvent(
        "evt-1",
        "filter-event-1",
        ["https://url-a.com/1"],
        [{ name: "A", url: "https://url-a.com/1" }],
      ),
      // filter-event-2 has no final event
    ]);
    const allUrls = new Set(["https://url-a.com/1"]);
    const result = validateReport(json, DEFAULT_CONFIG, allUrls, filterEventUrlMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FILTER_EVENT_NOT_MAPPED")).toBe(true);
  });

  it("passes when merged candidates have multiple URLs under one filterEventId", () => {
    const mergedMap = new Map([
      ["filter-event-1", new Set(["https://primary.com/1", "https://extra.com/1"])],
    ]);
    const json = makeJson([
      makeEvent(
        "evt-1",
        "filter-event-1",
        ["https://primary.com/1", "https://extra.com/1"],
        [
          { name: "P", url: "https://primary.com/1" },
          { name: "E", url: "https://extra.com/1" },
        ],
      ),
    ]);
    const allUrls = new Set(["https://primary.com/1", "https://extra.com/1"]);
    const result = validateReport(json, DEFAULT_CONFIG, allUrls, mergedMap);
    expect(result.ok).toBe(true);
  });

  it("fails when filterEventId is missing", () => {
    const evt = makeEvent(
      "evt-1",
      "filter-event-1",
      ["https://url-a.com/1"],
      [{ name: "A", url: "https://url-a.com/1" }],
    );
    delete (evt as Record<string, unknown>).filterEventId;
    const json = makeJson([evt]);
    const allUrls = new Set(["https://url-a.com/1"]);
    const result = validateReport(json, DEFAULT_CONFIG, allUrls, filterEventUrlMap);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "UNKNOWN_FILTER_EVENT_ID")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fiveMinuteBrief dedup
// ---------------------------------------------------------------------------

describe("validateReport — fiveMinuteBrief dedup", () => {
  function makeEvent(id: string) {
    return {
      id,
      title: `Event ${id}`,
      topic: "T",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "new" as const,
      status: "已确认" as const,
      quick: { what: "w", why: "y", impact: "i", action: "a" },
      full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
      candidateIds: [`https://example.com/${id}`],
      sources: [{ name: "S", url: `https://example.com/${id}` }],
    };
  }

  it("rejects duplicate ID within same topic", () => {
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [makeEvent("evt-1")],
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: ["evt-1", "evt-1"] }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
    };
    const urls = new Set(["https://example.com/evt-1"]);
    const result = validateReport(json, DEFAULT_CONFIG, urls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FIVE_MINUTE_DUPLICATE_ID")).toBe(true);
  });

  it("rejects duplicate ID across different topics", () => {
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [makeEvent("evt-1")],
      fiveMinuteBrief: {
        topicGroups: [
          { name: "A", eventIds: ["evt-1"] },
          { name: "B", eventIds: ["evt-1"] },
        ],
      },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1"] }] },
    };
    const urls = new Set(["https://example.com/evt-1"]);
    const result = validateReport(json, DEFAULT_CONFIG, urls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FIVE_MINUTE_DUPLICATE_ID")).toBe(true);
  });

  it("rejects when duplicates bypass fiveMinuteLimit", () => {
    const config = { ...DEFAULT_CONFIG, fiveMinuteLimit: 2 };
    const events = [makeEvent("evt-1"), makeEvent("evt-2"), makeEvent("evt-3")];
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events,
      // 3 unique but 4 total references (evt-1 twice) → exceeds limit of 2
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: ["evt-1", "evt-2", "evt-1"] }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: ["evt-1", "evt-2", "evt-3"] }] },
    };
    const urls = new Set([
      "https://example.com/evt-1",
      "https://example.com/evt-2",
      "https://example.com/evt-3",
    ]);
    const result = validateReport(json, config, urls);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FIVE_MINUTE_DUPLICATE_ID")).toBe(true);
    expect(result.errors.some((e) => e.code === "FIVE_MINUTE_OVER_LIMIT")).toBe(true);
  });

  it("passes for valid 6-item fiveMinuteBrief", () => {
    const events = Array.from({ length: 6 }, (_, i) => makeEvent(`evt-${i + 1}`));
    const json: PersonalReportJson = {
      generatedAt: "2026-07-27T08:00:00Z",
      coverageFrom: "2026-07-23T08:00:00Z",
      coverageTo: "2026-07-27T08:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events,
      fiveMinuteBrief: { topicGroups: [{ name: "T", eventIds: events.map((e) => e.id) }] },
      fullReport: { topicGroups: [{ name: "T", eventIds: events.map((e) => e.id) }] },
    };
    const urls = new Set(events.map((e) => `https://example.com/${e.id}`));
    const result = validateReport(json, DEFAULT_CONFIG, urls);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildFilterEventUrlMap
// ---------------------------------------------------------------------------

describe("buildFilterEventUrlMap", () => {
  it("assigns sequential filterEventIds and collects URLs", () => {
    const candidates: MergedCandidate[] = [
      { ...makeCandidate({ id: "a", sourceUrl: "https://a.com" }), additionalSources: ["https://extra.com"] },
      { ...makeCandidate({ id: "b", sourceUrl: "https://b.com" }), additionalSources: [] },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "E1",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "R",
          confidence: "high",
          reason: "R",
          needsContext: false,
        },
        {
          title: "E2",
          keepIds: ["2"],
          mergedIds: [],
          topic: "T",
          relevance: "R",
          confidence: "high",
          reason: "R",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const map = buildFilterEventUrlMap(candidates, filterResult);
    expect(map.size).toBe(2);
    expect(map.get("filter-event-1")).toContain("https://a.com");
    expect(map.get("filter-event-1")).toContain("https://extra.com");
    expect(map.get("filter-event-2")).toContain("https://b.com");
  });
});
