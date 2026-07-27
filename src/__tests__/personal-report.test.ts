import { describe, it, expect } from "vitest";
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
  buildPersonalReportPrompt,
} from "../personal-report.ts";
import type { CandidateItem, MergedCandidate } from "../personal-report.ts";
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
    // Same sourceUrl — no additional source needed (already merged into one)
    expect(result[0]!.additionalSources).toHaveLength(0);
  });

  it("deduplicates and tracks different source URLs for same item", () => {
    const candidates = [
      makeCandidate({ id: "a", sourceUrl: "https://example.com/item/1", sourceName: "GitHub" }),
      makeCandidate({ id: "b", sourceUrl: "https://news.ycombinator.com/item?id=123", sourceName: "HN" }),
    ];
    // These have different URLs, so they are NOT merged (different keys)
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
// buildPersonalReportPrompt
// ---------------------------------------------------------------------------

describe("buildPersonalReportPrompt", () => {
  it("includes candidate details in prompt", () => {
    const candidates = [
      {
        ...makeCandidate({ title: "New Feature X", subject: "Claude Code" }),
        additionalSources: [],
      },
    ];
    const prompt = buildPersonalReportPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("New Feature X");
    expect(prompt).toContain("Claude Code");
    expect(prompt).toContain("codex");
    expect(prompt).toContain("claude-code");
    expect(prompt).toContain("8"); // overviewLimit
    expect(prompt).toContain("20"); // detailLimit
  });

  it("includes excluded topics in prompt", () => {
    const candidates: MergedCandidate[] = [];
    const prompt = buildPersonalReportPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("纯 UI 细节");
  });

  it("includes coverage time range", () => {
    const candidates: MergedCandidate[] = [];
    const prompt = buildPersonalReportPrompt(candidates, DEFAULT_CONFIG, "2026-07-25", "2026-07-27");
    expect(prompt).toContain("2026-07-25");
    expect(prompt).toContain("2026-07-27");
  });
});
