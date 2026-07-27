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
  validateReport,
  generateNoUpdateReport,
  CATEGORY_LIMITS,
} from "../personal-report.ts";
import type { CandidateItem, MergedCandidate, FilterResult, PersonalReportJson } from "../personal-report.ts";
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
      makeCandidate({ id: "c1", sourceName: "ArXiv", sourceUrl: "https://arxiv/c1", subject: "Research", infoType: "paper" }),
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
    overview: [{ id: "evt-1", topic: "Test", summary: "Summary" }],
    toolStatus: { codex: "ok", "claude-code": "ok" },
    topics: [
      {
        name: "Topic 1",
        items: [
          {
            id: "evt-1",
            candidateIds: ["https://example.com/1"],
            title: "Item 1",
            eventTime: "2026-07-27T08:00:00Z",
            updateKind: "new",
            what: "what",
            why: "why",
            impact: "impact",
            status: "已确认",
            sources: [{ name: "GitHub", url: "https://example.com/1" }],
          },
        ],
      },
    ],
  };

  const VALID_URLS = new Set(["https://example.com/1"]);

  it("passes for valid report", () => {
    const result = validateReport(VALID_JSON, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects fabricated URLs", () => {
    const json = structuredClone(VALID_JSON);
    json.topics[0]!.items[0]!.sources = [{ name: "Fake", url: "https://fake-url.com/1" }];
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "FABRICATED_URL")).toBe(true);
  });

  it("rejects missing eventTime", () => {
    const json = structuredClone(VALID_JSON);
    json.topics[0]!.items[0]!.eventTime = "";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_EVENT_TIME")).toBe(true);
  });

  it("rejects zero eventTime", () => {
    const json = structuredClone(VALID_JSON);
    json.topics[0]!.items[0]!.eventTime = "0";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "MISSING_EVENT_TIME")).toBe(true);
  });

  it("rejects invalid status", () => {
    const json = structuredClone(VALID_JSON);
    json.topics[0]!.items[0]!.status = "invalid" as "已确认";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_STATUS")).toBe(true);
  });

  it("rejects invalid updateKind", () => {
    const json = structuredClone(VALID_JSON);
    json.topics[0]!.items[0]!.updateKind = "invalid" as "new";
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "INVALID_UPDATE_KIND")).toBe(true);
  });

  it("rejects when overview exceeds limit", () => {
    const json = structuredClone(VALID_JSON);
    json.overview = Array.from({ length: 20 }, (_, i) => ({
      id: `evt-${i}`,
      topic: `Topic ${i}`,
      summary: `Summary ${i}`,
    }));
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "OVERVIEW_OVER_LIMIT")).toBe(true);
  });

  it("rejects when details exceed limit", () => {
    const json = structuredClone(VALID_JSON);
    json.topics = [
      {
        name: "Big Topic",
        items: Array.from({ length: 25 }, (_, i) => ({
          id: `evt-${i}`,
          candidateIds: ["https://example.com/1"],
          title: `Item ${i}`,
          eventTime: "2026-07-27T08:00:00Z",
          updateKind: "new" as const,
          what: "what",
          why: "why",
          impact: "impact",
          status: "已确认" as const,
          sources: [{ name: "GitHub", url: "https://example.com/1" }],
        })),
      },
    ];
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "DETAILS_OVER_LIMIT")).toBe(true);
  });

  it("rejects when overview references non-existent item", () => {
    const json = structuredClone(VALID_JSON);
    json.overview = [{ id: "evt-nonexistent", topic: "X", summary: "Y" }];
    const result = validateReport(json, DEFAULT_CONFIG, VALID_URLS);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === "OVERVIEW_REF_MISSING")).toBe(true);
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
    json.topics[0]!.items[0]!.candidateIds = [];
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
  it("generates report with empty topics and toolStatus for all primary tools", () => {
    const { json } = generateNoUpdateReport(
      DEFAULT_CONFIG,
      "2026-07-23T00:00:00Z",
      "2026-07-27T00:00:00Z",
      "2026-07-27",
      "zh",
    );
    expect(json.topics).toHaveLength(0);
    expect(json.overview).toHaveLength(0);
    expect(json.toolStatus["codex"]).toBe("本期无重要更新");
    expect(json.toolStatus["claude-code"]).toBe("本期无重要更新");
  });
});
