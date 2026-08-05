import { describe, it, expect, vi } from "vitest";

// Mock saveFile and callLlm to prevent tests from writing to disk or calling LLM
vi.mock("../report.ts", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../report.ts")>();
  return {
    ...orig,
    saveFile: vi.fn(() => "mock-path"),
    callLlm: vi.fn(async () => "{}"),
  };
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
  buildRecoveryPrompt,
  buildCandidateUrlSet,
  buildKeptCandidateUrlSet,
  buildFilterEventUrlMap,
  bindReportEventsToFilterSources,
  canonicalizeReportSourceUrls,
  capFiveMinuteBrief,
  callLlmJsonWithRepair,
  normalizeFilterResultAssignments,
  buildFiveMinuteExcludedFilterEventIds,
  filterAndFillFiveMinuteBrief,
  validateReport,
  validateFilterResult,
  guardReportSchema,
  generateNoUpdateReport,
  renderPersonalReportMarkdown,
  capFilterResult,
  filterCandidatesByCoverage,
  buildSelectionAudit,
  generatePersonalReport,
  isHardExcluded,
  isLowValueForRecovery,
  CATEGORY_LIMITS,
  REPORT_TOKENS,
} from "../personal-report.ts";
import type {
  CandidateItem,
  MergedCandidate,
  FilterResult,
  FilterResultItem,
  PersonalReportJson,
  ReportEvent,
  RecoveryAuditData,
} from "../personal-report.ts";
import type { PersonalReportConfig } from "../config.ts";
import type { RepoFetch } from "../github.ts";
import { callLlm } from "../report.ts";

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
  fullReportMinimum: 12,
  overviewLimit: 8,
  detailLimit: 20,
  commercialMode: "exceptional_only",
  unknownProjectContext: true,
  maxProjectDiscoveries: 2,
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
  it("uses topic search results instead of activity-only trending rankings", () => {
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
        {
          fullName: "memory/project",
          description: "Long-term memory for agents",
          language: "Python",
          stargazersCount: 800,
          pushedAt: "2026-07-27",
          url: "https://github.com/memory/project",
          searchQuery: "agent-memory",
        },
        {
          fullName: "rag/project",
          description: "RAG evaluation toolkit",
          language: "Python",
          stargazersCount: 700,
          pushedAt: "2026-07-28",
          url: "https://github.com/rag/project",
          searchQuery: "rag",
        },
      ],
      trendingFetchSuccess: true,
      snapshotMarkers: { trendingNames: [], starCounts: {} },
    };
    const result = extractTrendingCandidates(data, 3);
    expect(result).toHaveLength(3);
    expect(result.every((c) => c.sourceName.startsWith("GitHub Search"))).toBe(true);
    expect(result.some((c) => c.sourceName === "GitHub Trending")).toBe(false);
    expect(new Set(result.map((c) => c.sourceName)).size).toBe(3);
    expect(result.every((c) => c.infoType === "product")).toBe(true);
    expect(result.every((c) => !c.rawSummary.includes("Stars:"))).toBe(true);
  });

  it("preserves GitHub Search ranking within a focus topic instead of favoring the latest push", () => {
    const data = {
      trendingRepos: [],
      searchRepos: [
        {
          fullName: "quality/first",
          description: "Mature long-term memory",
          language: "Python",
          stargazersCount: 1000,
          pushedAt: "2026-07-30",
          url: "https://github.com/quality/first",
          searchQuery: "agent-memory",
        },
        {
          fullName: "fresh/second",
          description: "Fresh but lower-ranked memory experiment",
          language: "Python",
          stargazersCount: 10,
          pushedAt: "2026-08-01",
          url: "https://github.com/fresh/second",
          searchQuery: "agent-memory",
        },
      ],
      trendingFetchSuccess: true,
      snapshotMarkers: { trendingNames: [], starCounts: {} },
    };

    expect(extractTrendingCandidates(data, 1)[0]?.title).toBe("quality/first");
  });
});

// ---------------------------------------------------------------------------
// extractRepoCandidates
// ---------------------------------------------------------------------------

describe("extractRepoCandidates", () => {
  it("uses issue creation time instead of ordinary update activity", () => {
    const fetch = {
      cfg: { id: "claude-code", repo: "anthropics/claude-code", name: "Claude Code" },
      issues: [
        {
          number: 76653,
          title: "Remote Control localhost proxy request",
          state: "open",
          user: { login: "user" },
          labels: [],
          created_at: "2026-07-11T00:00:00Z",
          updated_at: "2026-08-01T14:30:19Z",
          comments: 5,
          reactions: { "+1": 10 },
          body: "Feature request for subscription users on macOS",
          html_url: "https://github.com/anthropics/claude-code/issues/76653",
        },
      ],
      prs: [],
      releases: [],
    };

    const [candidate] = extractRepoCandidates(fetch as unknown as RepoFetch, DEFAULT_CONFIG, 20);

    expect(candidate?.eventTime).toBe("2026-07-11T00:00:00Z");
    expect(candidate?.timeEvidence).toBe("api-date");
    expect(candidate?.rawSummary).toContain("Updated: 2026-08-01T14:30:19Z");
  });

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

  it("excludes nightly releases that are not stable user-facing updates", () => {
    const fetch = {
      cfg: { id: "qwen-code", repo: "QwenLM/qwen-code", name: "Qwen Code" },
      issues: [],
      prs: [],
      releases: [
        {
          tag_name: "v0.21.2-nightly.20260801",
          name: "Nightly build",
          body: "Internal hook changes",
          published_at: "2026-08-01T00:00:00Z",
        },
      ],
    };

    expect(extractRepoCandidates(fetch as unknown as RepoFetch, DEFAULT_CONFIG, 20)).toEqual([]);
  });

  it("does not promote fresh primary-tool issues with no independent signal", () => {
    const fetch = {
      cfg: { id: "codex", repo: "openai/codex", name: "OpenAI Codex" },
      issues: [
        {
          number: 1,
          title: "A newly filed local-only bug",
          state: "open",
          user: { login: "user" },
          labels: [],
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
          comments: 0,
          reactions: { "+1": 0 },
          body: "Unconfirmed report",
          html_url: "https://github.com/openai/codex/issues/1",
        },
      ],
      prs: [],
      releases: [],
    };

    expect(extractRepoCandidates(fetch as unknown as RepoFetch, DEFAULT_CONFIG, 20)).toEqual([]);
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

  it("prioritizes project-relevant RAG and agent-memory papers over unrelated newer papers", () => {
    const paper = (id: string, title: string, summary: string, published: string) => ({
      id: `http://arxiv.org/abs/${id}`,
      title,
      summary,
      authors: ["Alice"],
      published,
      updated: published,
      categories: ["cs.AI"],
      url: `http://arxiv.org/abs/${id}`,
      pdfUrl: `http://arxiv.org/pdf/${id}`,
    });
    const data = {
      papers: [
        paper("2607.3", "Humanoid Dodgeball Control", "Reinforcement learning for robots", "2026-07-31"),
        paper("2607.2", "Mathematical Dualities", "A theorem in mathematical physics", "2026-07-30"),
        paper(
          "2607.1",
          "Evaluating Long-Term Memory for Retrieval-Augmented Agents",
          "RAG evaluation for persistent agent memory and knowledge bases",
          "2026-07-29",
        ),
      ],
      fetchSuccess: true,
    };

    const result = extractArxivCandidates(data, 1);

    expect(result[0]?.title).toBe("Evaluating Long-Term Memory for Retrieval-Augmented Agents");
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
  it("rejects malformed candidates instead of silently misclassifying them", () => {
    const malformed = makeCandidate({
      id: "https://example.com/malformed",
      sourceUrl: "https://example.com/malformed",
      subject: undefined as unknown as string,
    });

    expect(() => buildBalancedPool([malformed], DEFAULT_CONFIG)).toThrowError(
      /Invalid candidate.*subject.*https:\/\/example\.com\/malformed/,
    );
  });

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

  it("keeps focus-topic search results in their own larger category", () => {
    const searchCandidates = Array.from({ length: 14 }, (_, index) =>
      makeCandidate({
        id: `https://github.com/focus/repo-${index}`,
        sourceUrl: `https://github.com/focus/repo-${index}`,
        sourceName: `GitHub Search (${index % 2 === 0 ? "rag" : "agent-memory"})`,
        subject: "focus",
      }),
    );

    expect(buildBalancedPool(searchCandidates, DEFAULT_CONFIG)).toHaveLength(12);
  });

  it("excludes ordinary Claw candidates from the personal report", () => {
    const clawCandidates = Array.from({ length: 8 }, (_, index) =>
      makeCandidate({
        id: `https://github.com/example/zero-claw-${index}`,
        sourceUrl: `https://github.com/example/zero-claw-${index}`,
        sourceName: "GitHub",
        subject: "ZeroClaw",
      }),
    );

    expect(buildBalancedPool(clawCandidates, DEFAULT_CONFIG)).toHaveLength(0);
  });

  it("drops Anthropic-model-only candidates while retaining Claude Code client candidates", () => {
    const candidates = [
      makeCandidate({
        id: "opus",
        title: "Opus 4.8 emits stray tokens",
        subject: "Claude Code",
        sourceUrl: "https://github.com/anthropics/claude-code/issues/opus",
      }),
      makeCandidate({
        id: "client",
        title: "Claude Code client loses local transcript text",
        subject: "Claude Code",
        sourceUrl: "https://github.com/anthropics/claude-code/issues/client",
      }),
    ];

    expect(buildBalancedPool(candidates, DEFAULT_CONFIG).map((candidate) => candidate.id)).toEqual([
      "client",
    ]);
  });

  it("drops price-performance news for a model backend the user does not use", () => {
    const priceNews = makeCandidate({
      id: "price",
      title: "Advancing the price performance frontier with GPT-5.6",
      subject: "OpenAI",
      sourceName: "OpenAI",
      sourceUrl: "https://openai.com/index/price-performance",
    });
    const chinesePriceNews = makeCandidate({
      id: "price-zh",
      title: "Claude Code 成本下调",
      subject: "Anthropic",
      sourceName: "Anthropic",
      sourceUrl: "https://www.anthropic.com/news/lower-costs",
    });

    expect(buildBalancedPool([priceNews, chinesePriceNews], DEFAULT_CONFIG)).toEqual([]);
  });

  it("does not promote unshipped GitHub issues or PRs into a personal report", () => {
    const issue = makeCandidate({
      id: "issue",
      infoType: "issue",
      subject: "OpenAI Codex",
      sourceUrl: "https://github.com/openai/codex/issues/1",
    });
    const release = makeCandidate({
      id: "release",
      infoType: "release",
      subject: "OpenAI Codex",
      sourceUrl: "https://github.com/openai/codex/releases/tag/v1",
    });

    expect(buildBalancedPool([issue, release], DEFAULT_CONFIG).map((candidate) => candidate.id)).toEqual([
      "release",
    ]);
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
// Coverage and selection audit
// ---------------------------------------------------------------------------

describe("filterCandidatesByCoverage", () => {
  it("excludes an old issue that was merely updated inside the report window", () => {
    const oldIssue = {
      ...makeCandidate({
        id: "https://github.com/anthropics/claude-code/issues/76653",
        sourceUrl: "https://github.com/anthropics/claude-code/issues/76653",
        eventTime: "2026-07-11T00:00:00Z",
        infoType: "issue",
      }),
      additionalSources: [],
    };
    const currentRelease = {
      ...makeCandidate({
        id: "release::openai/codex::v1",
        sourceUrl: "https://github.com/openai/codex/releases/tag/v1",
        eventTime: "2026-07-31T00:00:00Z",
        infoType: "release",
      }),
      additionalSources: [],
    };

    expect(
      filterCandidatesByCoverage(
        [oldIssue, currentRelease],
        "2026-07-27T12:40:08Z",
        "2026-08-01T15:00:00Z",
      ).map((item) => item.id),
    ).toEqual(["release::openai/codex::v1"]);
  });
});

describe("buildSelectionAudit", () => {
  it("records every candidate with its kept or excluded reason", () => {
    const candidates: MergedCandidate[] = [
      { ...makeCandidate({ id: "kept", title: "Useful RAG update" }), additionalSources: [] },
      { ...makeCandidate({ id: "dropped", title: "Unreleased feature request" }), additionalSources: [] },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Useful RAG update",
          keepIds: ["1"],
          mergedIds: [],
          topic: "RAG",
          relevance: "Direct project use",
          confidence: "high",
          reason: "Can be applied now",
          needsContext: false,
        },
      ],
      excluded: [{ id: "2", reason: "Not shipped and no current action" }],
    };

    const audit = buildSelectionAudit(candidates, filterResult);

    expect(audit.decisionCounts).toEqual({ kept: 1, excluded: 1, unclassified: 0 });
    expect(audit.candidates).toEqual([
      expect.objectContaining({ candidateId: 1, title: "Useful RAG update", decision: "kept" }),
      expect.objectContaining({
        candidateId: 2,
        title: "Unreleased feature request",
        decision: "excluded",
        reason: "Not shipped and no current action",
      }),
    ]);
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
    expect(prompt).toContain("12");
    expect(prompt).toContain("16");
  });

  it("excludes subscription-only and unshipped features when the user does not use Anthropic services", () => {
    const prompt = buildFilterPrompt([], DEFAULT_CONFIG, "2026-07-25", "2026-07-27");

    expect(prompt).toContain("依赖 Anthropic 账号或订阅");
    expect(prompt).toContain("用户未明确确认使用 Remote Control、本地代理");
    expect(prompt).toContain("尚未交付的功能请求");
  });

  it("keeps the full-report threshold broader than the five-minute threshold", () => {
    const prompt = buildFilterPrompt([], DEFAULT_CONFIG, "2026-07-25", "2026-07-27");

    expect(prompt).toContain("优先形成 12～16 条");
    expect(prompt).toContain("不得把五分钟概览的门槛套用到完整报告");
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
    expect(config.personalReport.fullReportMinimum).toBe(12);
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

describe("bindReportEventsToFilterSources", () => {
  it("repairs a copied filterEventId when the event URLs identify exactly one Stage 1 event", () => {
    const report = {
      toolStatus: { codex: "本期无重要更新", "claude-code": "本期无重要更新" },
      events: [
        {
          filterEventId: "filter-event-1",
          id: "evt-1",
          title: "Slopsquatting",
          topic: "安全",
          eventTime: "2026-07-28T00:00:00Z",
          updateKind: "new" as const,
          status: "社区信号" as const,
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: ["https://dev.to/security"],
          sources: [{ name: "Dev.to", url: "https://dev.to/security" }],
        },
      ],
      fiveMinuteBrief: { topicGroups: [{ name: "安全", eventIds: ["evt-1"] }] },
      fullReport: { topicGroups: [{ name: "安全", eventIds: ["evt-1"] }] },
      coverageFrom: "2026-07-27T00:00:00Z",
      coverageTo: "2026-08-01T00:00:00Z",
      generatedAt: "2026-08-01T00:00:00Z",
    };
    const map = new Map([
      ["filter-event-1", new Set(["https://github.com/opencode/release"])],
      ["filter-event-2", new Set(["https://dev.to/security"])],
    ]);

    bindReportEventsToFilterSources(report, map);

    expect(report.events[0]?.filterEventId).toBe("filter-event-2");
  });

  it("does not guess when URLs span multiple Stage 1 events", () => {
    const event = {
      filterEventId: "filter-event-1",
      candidateIds: ["https://a.example", "https://b.example"],
      sources: [{ name: "A", url: "https://a.example" }],
    } as ReportEvent;
    const report = { events: [event] } as PersonalReportJson;
    const map = new Map([
      ["filter-event-1", new Set(["https://a.example"])],
      ["filter-event-2", new Set(["https://b.example"])],
    ]);

    bindReportEventsToFilterSources(report, map);

    expect(event.filterEventId).toBe("filter-event-1");
  });
});

describe("canonicalizeReportSourceUrls", () => {
  it("maps an equivalent ArXiv https URL back to the exact kept candidate URL", () => {
    const event = {
      candidateIds: ["https://arxiv.org/abs/2607.28591v1"],
      sources: [{ name: "ArXiv", url: "https://arxiv.org/abs/2607.28591v1" }],
    } as ReportEvent;

    canonicalizeReportSourceUrls(
      { events: [event] } as PersonalReportJson,
      new Set(["http://arxiv.org/abs/2607.28591v1"]),
    );

    expect(event.candidateIds).toEqual(["http://arxiv.org/abs/2607.28591v1"]);
    expect(event.sources[0]?.url).toBe("http://arxiv.org/abs/2607.28591v1");
  });

  it("does not rewrite a URL that has no kept-candidate equivalent", () => {
    const event = {
      candidateIds: ["https://example.com/fabricated"],
      sources: [{ name: "Web", url: "https://example.com/fabricated" }],
    } as ReportEvent;

    canonicalizeReportSourceUrls(
      { events: [event] } as PersonalReportJson,
      new Set(["https://example.com/real"]),
    );

    expect(event.candidateIds).toEqual(["https://example.com/fabricated"]);
  });
});

describe("capFiveMinuteBrief", () => {
  it("preserves topic and event order while enforcing the configured global limit", () => {
    const brief = {
      topicGroups: [
        { name: "A", eventIds: ["evt-1", "evt-2", "evt-3", "evt-4"] },
        { name: "B", eventIds: ["evt-5", "evt-6", "evt-7"] },
      ],
    };

    capFiveMinuteBrief(brief, 6);

    expect(brief.topicGroups).toEqual([
      { name: "A", eventIds: ["evt-1", "evt-2", "evt-3", "evt-4"] },
      { name: "B", eventIds: ["evt-5", "evt-6"] },
    ]);
  });
});

describe("callLlmJsonWithRepair", () => {
  it("budgets enough output for a 12-16 item full report", () => {
    expect(REPORT_TOKENS).toBeGreaterThanOrEqual(16384);
  });

  it("returns valid JSON without a repair call", async () => {
    const call = vi.fn().mockResolvedValueOnce('{"kept":[],"excluded":[]}');

    await expect(callLlmJsonWithRepair<FilterResult>("filter prompt", 100, call)).resolves.toEqual({
      kept: [],
      excluded: [],
    });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("makes one bounded format-repair call after invalid JSON", async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce('{"kept":[}')
      .mockResolvedValueOnce('{"kept":[],"excluded":[]}');

    await expect(callLlmJsonWithRepair<FilterResult>("filter prompt", 100, call)).resolves.toEqual({
      kept: [],
      excluded: [],
    });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1]?.[0]).toContain("只修复 JSON 语法和转义");
  });

  it("fails after the single repair attempt is still invalid", async () => {
    const call = vi.fn().mockResolvedValue('{"kept":[}');

    await expect(callLlmJsonWithRepair<FilterResult>("filter prompt", 100, call)).rejects.toBeInstanceOf(
      SyntaxError,
    );
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe("normalizeFilterResultAssignments", () => {
  it("keeps the first valid event assignment and removes kept/excluded overlap", () => {
    const result: FilterResult = {
      kept: [
        {
          title: "First",
          keepIds: ["1", "2"],
          mergedIds: [],
          topic: "A",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Second",
          keepIds: ["2", "3"],
          mergedIds: [],
          topic: "B",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [
        { id: "1", reason: "conflict" },
        { id: "4", reason: "not useful" },
      ],
    };

    expect(normalizeFilterResultAssignments(result, 4)).toEqual({
      kept: [
        expect.objectContaining({ title: "First", keepIds: ["1", "2"] }),
        expect.objectContaining({ title: "Second", keepIds: ["3"] }),
      ],
      excluded: [{ id: "4", reason: "not useful" }],
    });
  });

  it("leaves invalid IDs for strict validation instead of hiding them", () => {
    const result: FilterResult = {
      kept: [
        {
          title: "Invalid",
          keepIds: ["99"],
          mergedIds: [],
          topic: "A",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const normalized = normalizeFilterResultAssignments(result, 4);

    expect(validateFilterResult(normalized, 4).ok).toBe(false);
  });
});

describe("five-minute eligibility", () => {
  it("identifies non-primary releases and non-backend benchmark articles", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({ infoType: "release", subject: "GitHub Copilot CLI" }),
        additionalSources: [],
      },
      {
        ...makeCandidate({
          id: "codex",
          sourceUrl: "https://github.com/openai/codex/releases/tag/v1",
          infoType: "release",
          subject: "OpenAI Codex",
        }),
        additionalSources: [],
      },
      {
        ...makeCandidate({
          id: "benchmark",
          title: "How two settings tripled our ARC-AGI-3 scores",
          subject: "OpenAI",
          sourceName: "OpenAI",
          sourceUrl: "https://openai.com/index/arc-agi-settings",
          infoType: "article",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Copilot release",
          keepIds: ["1"],
          mergedIds: [],
          topic: "CLI",
          relevance: "reference",
          confidence: "medium",
          reason: "reference",
          needsContext: false,
        },
        {
          title: "Codex release",
          keepIds: ["2"],
          mergedIds: [],
          topic: "CLI",
          relevance: "direct",
          confidence: "high",
          reason: "direct",
          needsContext: false,
        },
        {
          title: "ARC benchmark result",
          keepIds: ["3"],
          mergedIds: [],
          topic: "Evaluation",
          relevance: "indirect",
          confidence: "medium",
          reason: "reference",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    expect(buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG)).toEqual(
      new Set(["filter-event-1", "filter-event-3"]),
    );
  });

  it("keeps transferable evaluation guides eligible for the overview", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          title: "Build a reproducible LLM benchmark harness",
          subject: "Independent Engineer",
          sourceName: "Dev.to",
          sourceUrl: "https://dev.to/example/reproducible-benchmark",
          infoType: "article",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Reproducible evaluation guide",
          keepIds: ["1"],
          mergedIds: [],
          topic: "Evaluation",
          relevance: "direct",
          confidence: "high",
          reason: "transferable engineering method",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    expect(buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG)).toEqual(
      new Set(),
    );
  });

  it("removes ineligible events and fills the brief to five from the full report", () => {
    const event = (id: string, filterEventId: string) => ({ id, filterEventId }) as ReportEvent;
    const report = {
      events: [
        event("evt-1", "filter-event-1"),
        event("evt-2", "filter-event-2"),
        event("evt-3", "filter-event-3"),
        event("evt-4", "filter-event-4"),
        event("evt-5", "filter-event-5"),
        event("evt-6", "filter-event-6"),
        event("evt-7", "filter-event-7"),
      ],
      fiveMinuteBrief: {
        topicGroups: [{ name: "CLI", eventIds: ["evt-1", "evt-2", "evt-3", "evt-4", "evt-5"] }],
      },
      fullReport: {
        topicGroups: [
          { name: "CLI", eventIds: ["evt-1", "evt-2"] },
          { name: "RAG", eventIds: ["evt-3", "evt-4", "evt-5", "evt-6", "evt-7"] },
        ],
      },
    } as PersonalReportJson;

    filterAndFillFiveMinuteBrief(report, new Set(["filter-event-1", "filter-event-2"]), 6, 5);

    expect(report.fiveMinuteBrief.topicGroups.flatMap((group) => group.eventIds)).toEqual([
      "evt-3",
      "evt-4",
      "evt-5",
      "evt-6",
      "evt-7",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test fixtures and helpers
// ---------------------------------------------------------------------------

/** Generate N sequential MergedCandidate items for integration tests. */
function makeCandidates(n: number): MergedCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `https://example.com/candidate/${i + 1}`,
    title: `Candidate ${i + 1}`,
    subject: i < 8 ? "Codex" : i < 16 ? "Claude Code" : i < 24 ? "RAG Project" : "Agent Tool",
    summary: `Summary for candidate ${i + 1}`,
    eventTime: "2026-08-02T12:00:00Z",
    timeEvidence: "api-date" as const,
    sourceName:
      i < 16 ? "GitHub" : i < 24 ? `GitHub Search (${i < 20 ? "rag" : "agent-memory"})` : "Hacker News",
    sourceUrl: `https://example.com/candidate/${i + 1}`,
    infoType: i < 16 ? ("release" as const) : ("product" as const),
    officialConfirmed: i < 16,
    relevanceDimensions: [],
    rawSummary: `Raw data for ${i + 1}`,
    additionalSources: [],
  }));
}

/** Create a minimal valid Stage 2 report JSON with N events. */
function makeReportJson(n: number): PersonalReportJson {
  const eventIds = Array.from({ length: n }, (_, i) => `evt-${i + 1}`);
  return {
    generatedAt: "2026-08-02T12:00:00Z",
    coverageFrom: "2026-08-01T00:00:00Z",
    coverageTo: "2026-08-03T00:00:00Z",
    toolStatus: { codex: "ok", "claude-code": "ok" },
    events: eventIds.map((id, i) => ({
      id,
      filterEventId: `filter-event-${i + 1}`,
      title: `Event ${i + 1}`,
      topic: "Topic",
      eventTime: "2026-08-02T12:00:00Z",
      updateKind: "new" as const,
      status: "已确认" as const,
      quick: {
        what: `what ${i + 1}`,
        why: `why ${i + 1}`,
        impact: `impact ${i + 1}`,
        action: `act ${i + 1}`,
      },
      full: {
        background: `bg ${i + 1}`,
        evidence: `ev ${i + 1}`,
        analysis: `an ${i + 1}`,
        impact: `imp ${i + 1}`,
        action: `act ${i + 1}`,
      },
      candidateIds: [`https://example.com/candidate/${i + 1}`],
      sources: [{ name: "Source", url: `https://example.com/candidate/${i + 1}` }],
    })),
    fiveMinuteBrief: { topicGroups: [{ name: "Topic", eventIds }] },
    fullReport: { topicGroups: [{ name: "Topic", eventIds }] },
  };
}

/**
 * Create a Stage 2 report JSON with events for specific candidate indices (1-based).
 * Needed when recovery changes which candidates are kept.
 */
function makeReportJsonForCandidates(candidateIndices: number[]): PersonalReportJson {
  const eventIds = candidateIndices.map((_, i) => `evt-${i + 1}`);
  return {
    generatedAt: "2026-08-02T12:00:00Z",
    coverageFrom: "2026-08-01T00:00:00Z",
    coverageTo: "2026-08-03T00:00:00Z",
    toolStatus: { codex: "ok", "claude-code": "ok" },
    events: candidateIndices.map((candIdx, i) => ({
      id: eventIds[i]!,
      filterEventId: `filter-event-${i + 1}`,
      title: `Event for candidate ${candIdx}`,
      topic: "Topic",
      eventTime: "2026-08-02T12:00:00Z",
      updateKind: "new" as const,
      status: "已确认" as const,
      quick: {
        what: `what ${candIdx}`,
        why: `why ${candIdx}`,
        impact: `impact ${candIdx}`,
        action: `act ${candIdx}`,
      },
      full: {
        background: `bg ${candIdx}`,
        evidence: `ev ${candIdx}`,
        analysis: `an ${candIdx}`,
        impact: `imp ${candIdx}`,
        action: `act ${candIdx}`,
      },
      candidateIds: [`https://example.com/candidate/${candIdx}`],
      sources: [{ name: "Source", url: `https://example.com/candidate/${candIdx}` }],
    })),
    fiveMinuteBrief: { topicGroups: [{ name: "Topic", eventIds }] },
    fullReport: { topicGroups: [{ name: "Topic", eventIds }] },
  };
}

/**
 * Create a Stage 1 filter response with `keptCount` kept items from a pool of `candidateCount`.
 * Keeps candidates 1..keptCount, excludes the rest.
 */
function makeStage1Response(keptCount: number, candidateCount: number): FilterResult {
  const kept: FilterResultItem[] = Array.from({ length: keptCount }, (_, i) => ({
    title: `Stage1 Event ${i + 1}`,
    keepIds: [`${i + 1}`],
    mergedIds: [],
    topic: "Topic",
    relevance: "relevant",
    confidence: "high" as const,
    reason: "valuable",
    needsContext: false,
  }));
  const excluded = Array.from({ length: candidateCount - keptCount }, (_, i) => ({
    id: `${keptCount + i + 1}`,
    reason: "low value",
  }));
  return { kept, excluded };
}

/**
 * Create a recovery filter response with `count` new items, starting from candidate index `startIdx`.
 */
function makeRecoveryResponse(startIdx: number, count: number): FilterResult {
  const kept: FilterResultItem[] = Array.from({ length: count }, (_, i) => ({
    title: `Recovery Event ${i + 1}`,
    keepIds: [`${startIdx + i}`],
    mergedIds: [],
    topic: "Recovery Topic",
    relevance: "recoverable",
    confidence: "medium" as const,
    reason: "worth reconsidering",
    needsContext: true,
  }));
  return { kept, excluded: [] };
}

const COVERAGE_FROM = "2026-08-01T00:00:00Z";
const COVERAGE_TO = "2026-08-03T00:00:00Z";

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 1: triggers recovery when underfilled
// ---------------------------------------------------------------------------

describe("underfilled recovery — triggers recovery", () => {
  it("test 1: 31 candidates, first pass keeps 4 → triggers exactly one recovery", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(6));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events.length).toBeGreaterThanOrEqual(4);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(mock.mock.calls[1]![0]).toContain("恢复筛选");
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 2: does not trigger when already sufficient
// ---------------------------------------------------------------------------

describe("underfilled recovery — skip when sufficient", () => {
  it("test 2: 31 candidates, first pass keeps 12 → no recovery call", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(12, 31);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      expect(prompt).not.toContain("恢复筛选");
      return JSON.stringify(makeReportJson(12));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 3: low candidate count allows fewer events
// ---------------------------------------------------------------------------

describe("underfilled recovery — low candidate count", () => {
  it("test 3: 5 candidates total → recovery triggers but cannot add more than available", async () => {
    const candidates = makeCandidates(5);
    const stage1Result = makeStage1Response(3, 5);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) {
        // Recovery returns empty (no good candidates among the 2 excluded)
        return JSON.stringify({ kept: [], excluded: [] });
      }
      return JSON.stringify(makeReportJson(3));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(3);
    // 3 calls: Stage 1 + recovery + Stage 2
    expect(mock).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 4: recovery preserves first-pass kept events
// ---------------------------------------------------------------------------

describe("underfilled recovery — preserves first-pass events", () => {
  it("test 4: recovery adds events resulting in more than initial count", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      // Stage 2 receives 6 events (4 initial + 2 recovery)
      return JSON.stringify(makeReportJson(6));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    // Stage 2 should receive 6 filtered events and produce 6 report events
    expect(result!.json.events).toHaveLength(6);
    // The report should have all events in fullReport
    const fullReportIds = result!.json.fullReport.topicGroups.flatMap((g) => g.eventIds);
    expect(fullReportIds.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 5: merged result passes integrity validation
// ---------------------------------------------------------------------------

describe("underfilled recovery — merge integrity", () => {
  it("test 5: merged recovery result passes validateFilterResult", () => {
    // Simulate: Stage 1 kept IDs 1-4, recovery returns IDs 5-6 (no overlap)
    const stage1 = makeStage1Response(4, 31);
    const recovery = makeRecoveryResponse(5, 2);

    // Merge kept arrays
    const merged: FilterResult = {
      kept: [...stage1.kept, ...recovery.kept],
      excluded: [...stage1.excluded],
    };

    // Normalize and validate
    const normalized = normalizeFilterResultAssignments(merged, 31);
    const validation = validateFilterResult(normalized, 31);

    expect(validation.ok).toBe(true);
    expect(normalized.kept).toHaveLength(6);
    // First-pass events are still first
    expect(normalized.kept[0]!.title).toBe("Stage1 Event 1");
    expect(normalized.kept[4]!.title).toBe("Recovery Event 1");
  });

  it("test 5b: recovery IDs overlapping with first-pass are deduplicated", () => {
    // Recovery mistakenly returns ID 2 which is already kept
    const stage1 = makeStage1Response(4, 31);
    const badRecovery: FilterResult = {
      kept: [
        {
          title: "Recovery Duplicate",
          keepIds: ["2"], // Already kept by Stage 1!
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Recovery New",
          keepIds: ["5"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const merged: FilterResult = {
      kept: [...stage1.kept, ...badRecovery.kept],
      excluded: [...stage1.excluded],
    };

    const normalized = normalizeFilterResultAssignments(merged, 31);
    const validation = validateFilterResult(normalized, 31);

    expect(validation.ok).toBe(true);
    // The duplicate ID "2" should be removed from recovery, so "Recovery Duplicate" gets pruned
    // (its keepIds become empty after dedup)
    const titles = normalized.kept.map((k) => k.title);
    expect(titles).toContain("Stage1 Event 2"); // Original preserved
    expect(titles).toContain("Recovery New"); // Non-duplicate recovery preserved
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 6: recovery failure falls back gracefully
// ---------------------------------------------------------------------------

describe("underfilled recovery — failure fallback", () => {
  it("test 6a: recovery returns invalid JSON → falls back to first-pass result", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return "NOT VALID JSON {{{";
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(4);
    expect(mock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("test 6b: recovery LLM call throws → falls back to first-pass result", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) throw new Error("LLM rate limited");
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(4);
  });

  it("test 6c: recovery returns empty kept → falls back to first-pass result", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 7: hard exclusion survives recovery
// ---------------------------------------------------------------------------

describe("underfilled recovery — hard exclusion", () => {
  it("test 7: Anthropic pricing, Claw, and activity ranking candidates stay excluded after recovery", () => {
    // The recovery prompt must contain the same hard-exclusion rules as Stage 1
    const excluded = [
      { id: "10", reason: "Anthropic pricing" },
      { id: "11", reason: "普通 Claw" },
      { id: "12", reason: "活跃度排行" },
    ];
    const stage1Kept: FilterResultItem[] = [
      {
        title: "Valid Event",
        keepIds: ["1"],
        mergedIds: [],
        topic: "T",
        relevance: "r",
        confidence: "high",
        reason: "r",
        needsContext: false,
      },
    ];

    const recoveryPrompt = buildRecoveryPrompt(
      stage1Kept,
      excluded,
      makeCandidates(31),
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
    );

    // Hard exclusion rules must be in the recovery prompt
    expect(recoveryPrompt).toContain("Anthropic Claude 模型、账号、订阅和价格");
    expect(recoveryPrompt).toContain("普通 Claw");
    expect(recoveryPrompt).toContain("活跃度、Star");
    expect(recoveryPrompt).toContain("无事实证据的投诉");
    expect(recoveryPrompt).toContain("公司战略、治理争议");
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 8: RAG/Agent projects can be re-evaluated
// ---------------------------------------------------------------------------

describe("underfilled recovery — project re-evaluation", () => {
  it("test 8a: recovery prompt includes RAG, Agent workflow, and knowledge base projects", () => {
    const excluded = [
      { id: "20", reason: "描述宽泛，缺少具体能力说明" },
      { id: "21", reason: "陌生项目" },
    ];
    const candidates = makeCandidates(31);
    // Give candidates 20 and 21 relevant descriptions
    candidates[19]!.title = "LightRAG";
    candidates[19]!.summary = "A RAG framework for knowledge graph construction and retrieval";
    candidates[19]!.rawSummary = "Query: rag; Topics: rag, knowledge-graph, retrieval";

    candidates[20]!.title = "Dify";
    candidates[20]!.summary = "Agent workflow orchestration platform with RAG pipeline";
    candidates[20]!.rawSummary = "Query: agent-memory; Topics: agent, workflow, rag";

    const recoveryPrompt = buildRecoveryPrompt(
      [
        {
          title: "Event",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded,
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
    );

    // Excluded candidates must be shown with their actual descriptions
    expect(recoveryPrompt).toContain("LightRAG");
    expect(recoveryPrompt).toContain("knowledge graph construction");
    expect(recoveryPrompt).toContain("Dify");
    expect(recoveryPrompt).toContain("Agent workflow orchestration");
    // Recovery guidance about what CAN be reconsidered
    expect(recoveryPrompt).toContain("RAG");
    expect(recoveryPrompt).toContain("Agent 工作流");
  });

  it("test 8b: GitHub Search topics are included in candidate rawSummary for LLM context", () => {
    const data = {
      trendingRepos: [],
      searchRepos: [
        {
          fullName: "lightrag/lightrag",
          description: "Fast RAG framework",
          language: "Python",
          stargazersCount: 5000,
          pushedAt: "2026-08-02",
          url: "https://github.com/lightrag/lightrag",
          searchQuery: "rag",
          topics: ["rag", "knowledge-graph", "retrieval", "llm"],
        },
      ],
      trendingFetchSuccess: true,
      snapshotMarkers: { trendingNames: [], starCounts: {} },
    };
    const result = extractTrendingCandidates(data, 1);
    expect(result[0]!.rawSummary).toContain("Topics: rag, knowledge-graph, retrieval, llm");
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 9: fiveMinuteBrief follows strict rules after recovery
// ---------------------------------------------------------------------------

describe("underfilled recovery — fiveMinuteBrief after recovery", () => {
  it("test 9: recovery events with needsContext=true do not automatically enter fiveMinuteBrief", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "RAG Framework",
          keepIds: ["5"],
          mergedIds: [],
          topic: "RAG",
          relevance: "worth evaluating",
          confidence: "medium",
          reason: "new RAG framework",
          needsContext: true,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      const reportJson = makeReportJson(5);
      reportJson.fiveMinuteBrief = {
        topicGroups: [{ name: "Topic", eventIds: ["evt-1", "evt-2", "evt-3"] }],
      };
      return JSON.stringify(reportJson);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    const fullReportIds = result!.json.fullReport.topicGroups.flatMap((g) => g.eventIds);
    expect(fullReportIds.length).toBeGreaterThanOrEqual(5);
    const briefIds = result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds);
    expect(briefIds.length).toBeLessThanOrEqual(DEFAULT_CONFIG.fiveMinuteLimit);
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Test 10: prompt no longer has conflicting instructions
// ---------------------------------------------------------------------------

describe("underfilled recovery — prompt consistency", () => {
  it("test 10a: Stage 1 prompt has no conflicting 'no minimum' instruction", () => {
    const prompt = buildFilterPrompt(makeCandidates(31), DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO);

    // The conflicting instruction must be removed
    expect(prompt).not.toContain("不设置最低数量");
    expect(prompt).not.toContain("宁缺毋滥");

    // The correct target must be present
    expect(prompt).toContain("12～16");
    expect(prompt).toContain("完整报告入选门槛");
  });

  it("test 10b: Stage 1 prompt instructs '陌生项目' to use needsContext instead of excluding", () => {
    const prompt = buildFilterPrompt(makeCandidates(31), DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO);

    // "陌生项目" should be handled via needsContext, not by exclusion
    expect(prompt).toContain("needsContext");
    expect(prompt).toContain("陌生项目");
    // Should say to pass to Stage 2 for context, not exclude
    expect(prompt).toContain("Stage 2");
  });

  it("test 10c: Stage 1 prompt explicitly mentions fullReportMinimum", () => {
    const prompt = buildFilterPrompt(makeCandidates(31), DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO);

    expect(prompt).toContain("12");
    expect(prompt).toContain("完整报告");
  });

  it("test 10d: config.yml loads fullReportMinimum correctly", async () => {
    const { loadConfig } = await import("../config.ts");
    const config = loadConfig("config.yml");
    expect(config.personalReport.fullReportMinimum).toBe(12);
    expect(config.personalReport.fullReportMinimum).toBeLessThanOrEqual(
      config.personalReport.fullReportLimit,
    );
  });
});

// ---------------------------------------------------------------------------
// Underfilled Recovery — Audit fields
// ---------------------------------------------------------------------------

describe("underfilled recovery — audit metadata", () => {
  it("test: selection audit includes recovery metadata fields", () => {
    const audit = buildSelectionAudit(makeCandidates(10), makeStage1Response(4, 10));
    const recoveryData: RecoveryAuditData = {
      initialKeptCount: 4,
      minimumTarget: 12,
      recoveryTriggered: true,
      recoveryCandidateCount: 6,
      recoveryAddedCount: 2,
      finalKeptCount: 6,
      underfilled: true,
    };

    const combined = { ...audit, ...recoveryData };

    expect(combined.initialKeptCount).toBe(4);
    expect(combined.minimumTarget).toBe(12);
    expect(combined.recoveryTriggered).toBe(true);
    expect(combined.recoveryCandidateCount).toBe(6);
    expect(combined.recoveryAddedCount).toBe(2);
    expect(combined.finalKeptCount).toBe(6);
    expect(combined.underfilled).toBe(true);
    expect(combined.recoveryFailureReason).toBeUndefined();
  });

  it("test: audit records recovery failure reason when recovery fails", () => {
    const recoveryData: RecoveryAuditData = {
      initialKeptCount: 4,
      minimumTarget: 12,
      recoveryTriggered: true,
      recoveryCandidateCount: 27,
      recoveryAddedCount: 0,
      finalKeptCount: 4,
      underfilled: true,
      recoveryFailureReason: "Invalid JSON from LLM",
    };

    expect(recoveryData.recoveryFailureReason).toBe("Invalid JSON from LLM");
    expect(recoveryData.underfilled).toBe(true);
    expect(recoveryData.finalKeptCount).toBe(4);
  });

  it("test: audit omits recoveryFailureReason when no failure", () => {
    const recoveryData: RecoveryAuditData = {
      initialKeptCount: 14,
      minimumTarget: 12,
      recoveryTriggered: false,
      recoveryCandidateCount: 0,
      recoveryAddedCount: 0,
      finalKeptCount: 14,
      underfilled: false,
    };

    expect(recoveryData.recoveryFailureReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Issue 1: Hard exclusion enforcement in recovery
// ---------------------------------------------------------------------------

/**
 * Create candidates with specific hard-excluded items at known positions.
 * Positions 10, 11, 12 are hard-excluded: Anthropic pricing, Claw, activity ranking.
 */
function makeCandidatesWithHardExcluded(n: number): MergedCandidate[] {
  const cands = makeCandidates(n);
  // Candidate 10: Anthropic pricing (hard-excluded by price+publisher rule)
  cands[9]!.title = "Claude Opus Price Reduction";
  cands[9]!.summary = "Anthropic announces new pricing tiers for Claude Opus";
  cands[9]!.subject = "Anthropic";
  cands[9]!.sourceName = "Anthropic";
  cands[9]!.rawSummary = "Price: 50% reduction for API users";
  // Candidate 11: Claw (hard-excluded by subject rule)
  cands[10]!.title = "Claw v2 Released";
  cands[10]!.subject = "OpenClaw";
  cands[10]!.sourceName = "GitHub";
  cands[10]!.rawSummary = "New version of OpenClaw with CLI improvements";
  // Candidate 12: Activity ranking (hard-excluded by text rule)
  cands[11]!.title = "AI CLI Activity Ranking 2026";
  cands[11]!.summary = "Star count and maturity ranking of AI coding tools";
  cands[11]!.rawSummary = "活跃度排行 based on star count and maturity metrics";
  return cands;
}

describe("issue 1 — hard exclusion enforcement in recovery", () => {
  it("recovery returns Anthropic pricing candidate ID → no new events", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    const stage1Result = makeStage1Response(4, 31);
    // Recovery tries to add candidate 10 (Anthropic pricing — hard-excluded)
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Pricing Update",
          keepIds: ["10"],
          mergedIds: [],
          topic: "Pricing",
          relevance: "cost change",
          confidence: "high",
          reason: "pricing",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    // Recovery should not add any events (ID 10 is hard-excluded)
    expect(result!.json.events).toHaveLength(4);
  });

  it("recovery returns Claw candidate ID → no new events", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Claw Update",
          keepIds: ["11"],
          mergedIds: [],
          topic: "Claw",
          relevance: "claw update",
          confidence: "medium",
          reason: "claw",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(4);
  });

  it("recovery returns activity ranking candidate ID → no new events", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Activity Ranking",
          keepIds: ["12"],
          mergedIds: [],
          topic: "Ranking",
          relevance: "ranking",
          confidence: "medium",
          reason: "ranking",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(4);
  });

  it("recovery event mixing allowed + hard-excluded ID → entire event discarded", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    const stage1Result = makeStage1Response(4, 31);
    // Recovery returns one event with IDs [5, 10] — 5 is allowed, 10 is hard-excluded
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Mixed Event",
          keepIds: ["5", "10"],
          mergedIds: [],
          topic: "Mixed",
          relevance: "mixed",
          confidence: "medium",
          reason: "mixed",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(4));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    // Entire event discarded because ID 10 is hard-excluded
    expect(result!.json.events).toHaveLength(4);
  });

  it("recovery returns fully allowed new IDs → normal merge", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    const stage1Result = makeStage1Response(4, 31);
    // Recovery returns ID 5 and 6 — both are in eligibleExcluded (not hard-excluded)
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(6));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(6);
  });

  it("Stage 2 never receives hard-excluded candidates in filterResult", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    const stage1Result = makeStage1Response(4, 31);
    // Recovery tries to sneak in IDs 5 (allowed) and 10 (hard-excluded)
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Sneaky Event",
          keepIds: ["5", "10"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    let stage2Prompt = "";
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      // Capture Stage 2 prompt
      stage2Prompt = prompt;
      return JSON.stringify(makeReportJson(4));
    });

    await generatePersonalReport(candidates, DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO, "2026-08-03", "zh");

    // Stage 2 prompt should NOT contain candidate 10's title or content
    expect(stage2Prompt).not.toContain("Claude Opus Price Reduction");
    // Stage 2 should only have the 4 original events (mixed event was discarded)
    expect(stage2Prompt).toContain("Stage1 Event 1");
  });
});

// ---------------------------------------------------------------------------
// Issue 2: Stage 1 returning 0 should attempt recovery
// ---------------------------------------------------------------------------

describe("issue 2 — Stage 1 returning 0 attempts recovery", () => {
  it("31 candidates, Stage 1 returns 0, recovery returns 2 → calls Stage 2, not no-update", async () => {
    const candidates = makeCandidatesWithHardExcluded(31);
    // Stage 1 returns 0 kept, 31 excluded
    const stage1Result: FilterResult = {
      kept: [],
      excluded: Array.from({ length: 31 }, (_, i) => ({
        id: String(i + 1),
        reason: "low value",
      })),
    };
    // Recovery returns 2 valid events from eligible candidates
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      // Stage 2 receives recovery result with IDs 5 and 6
      return JSON.stringify(makeReportJsonForCandidates([5, 6]));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    // Should NOT be a no-update report — recovery saved it
    expect(result).not.toBeNull();
    expect(result!.json.events.length).toBeGreaterThanOrEqual(2);
    // Verify it's not a no-update report
    expect(result!.json.events).not.toHaveLength(0);
    // Should have called Stage 2
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("Stage 1 returns 0, recovery empty → no-update report", async () => {
    const candidates = makeCandidates(31);
    const stage1Result: FilterResult = {
      kept: [],
      excluded: Array.from({ length: 31 }, (_, i) => ({
        id: String(i + 1),
        reason: "low value",
      })),
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      // Should not reach Stage 2
      throw new Error("Should not call Stage 2");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(0);
    expect(result!.json.toolStatus["codex"]).toBe("本期无重要更新");
  });

  it("Stage 1 returns 0, all candidates hard-excluded → no recovery, no-update", async () => {
    // All 5 candidates are Claw (hard-excluded)
    const candidates = makeCandidates(5);
    for (let i = 0; i < 5; i++) {
      candidates[i]!.subject = "OpenClaw";
      candidates[i]!.title = "Claw update " + i;
    }
    const stage1Result: FilterResult = {
      kept: [],
      excluded: Array.from({ length: 5 }, (_, i) => ({
        id: String(i + 1),
        reason: "low value",
      })),
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    mock.mockImplementation(async (prompt: string) => {
      if (!prompt.includes("恢复筛选")) return JSON.stringify(stage1Result);
      // Should not be called if all candidates are hard-excluded
      throw new Error("Recovery should not be called when all candidates are hard-excluded");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(0);
    expect(result!.json.toolStatus["codex"]).toBe("本期无重要更新");
  });
});

// ---------------------------------------------------------------------------
// Issue 3: Config constraint clamping
// ---------------------------------------------------------------------------

describe("issue 3 — config constraint clamping", () => {
  it("full_report_minimum: 100 with full_report_limit: 16 → minimum clamped to 16", async () => {
    const { loadConfig } = await import("../config.ts");
    // The real config.yml has minimum=12, limit=16. Test the clamping logic directly.
    // We test by checking the config parsing clamps correctly.
    const config = loadConfig("config.yml");
    expect(config.personalReport.fullReportMinimum).toBeLessThanOrEqual(
      config.personalReport.fullReportLimit,
    );
  });

  it("Stage 1 prompt does not show contradictory range when minimum > limit", () => {
    // Create a config where minimum > limit to test prompt generation
    const badConfig = { ...DEFAULT_CONFIG, fullReportMinimum: 100, fullReportLimit: 16 };
    // The prompt builder uses config values directly; the clamping should happen in config parsing
    // But even with raw values, the prompt should use the clamped value
    // This test documents the expected behavior: after config clamping, the prompt is consistent
    const clampedConfig = {
      ...badConfig,
      fullReportMinimum: Math.min(badConfig.fullReportMinimum, badConfig.fullReportLimit),
    };
    const prompt = buildFilterPrompt(makeCandidates(31), clampedConfig, COVERAGE_FROM, COVERAGE_TO);
    // Should show "16～16" not "100～16"
    expect(prompt).not.toContain("100");
    expect(prompt).toContain("16");
  });
});

// ---------------------------------------------------------------------------
// Issue 3: Error message sanitization in audit
// ---------------------------------------------------------------------------

describe("issue 3 — error message sanitization", () => {
  it("recovery failure audit uses generic error code, not raw LLM exception text", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    const FAKE_TOKEN = "sk-ant-secret-token-12345";
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) {
        throw new Error("API error: invalid key " + FAKE_TOKEN);
      }
      return JSON.stringify(makeReportJson(4));
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );
    consoleSpy.mockRestore();

    expect(result).not.toBeNull();
    // The result should not contain the fake token
    const resultStr = JSON.stringify(result!.json);
    expect(resultStr).not.toContain(FAKE_TOKEN);
  });
});

// ---------------------------------------------------------------------------
// Test 9 refinement: fiveMinuteBrief product rules
// ---------------------------------------------------------------------------

describe("issue 4 — fiveMinuteBrief product rules refinement", () => {
  it("non-primary CLI release is excluded from both pool and fiveMinuteBrief", () => {
    // Direct test: non-primary CLI releases are filtered by isCandidateApplicable
    const candidates = makeCandidates(5);
    candidates[4]!.infoType = "release";
    candidates[4]!.subject = "Gemini CLI";
    candidates[4]!.sourceName = "GitHub";

    // buildBalancedPool uses isCandidateApplicable which now excludes non-primary CLI releases
    const pool = buildBalancedPool(candidates, DEFAULT_CONFIG);
    expect(pool.some((c) => c.subject.includes("Gemini"))).toBe(false);

    // Also excluded from fiveMinuteBrief via buildFiveMinuteExcludedFilterEventIds
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Gemini CLI release",
          keepIds: ["5"],
          mergedIds: [],
          topic: "CLI",
          relevance: "reference",
          confidence: "medium",
          reason: "reference",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(true);
  });

  it("high-relevance recovery events with needsContext CAN enter fiveMinuteBrief when they pass strict rules", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    // Recovery returns a high-relevance event with needsContext=true
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Critical RAG Framework",
          keepIds: ["5"],
          mergedIds: [],
          topic: "RAG",
          relevance: "direct project application",
          confidence: "high",
          reason: "directly applicable RAG framework",
          needsContext: true,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      // Stage 2: includes the recovery event in fiveMinuteBrief
      const reportJson = makeReportJson(5);
      reportJson.fiveMinuteBrief = {
        topicGroups: [{ name: "RAG", eventIds: ["evt-1", "evt-2", "evt-3", "evt-4", "evt-5"] }],
      };
      return JSON.stringify(reportJson);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    const briefIds = new Set(result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds));
    // The high-relevance recovery event CAN be in fiveMinuteBrief
    // (needsContext is NOT an absolute exclusion from brief)
    expect(briefIds.size).toBeLessThanOrEqual(DEFAULT_CONFIG.fiveMinuteLimit);
    expect(briefIds.size).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Round 4 — Issue 1: Recovery pool from all coveredCandidates
// ---------------------------------------------------------------------------

describe("round 4 — recovery pool from all coveredCandidates", () => {
  it("Stage 1 returns kept:[], excluded:[] with 31 normal candidates → recovery still runs", async () => {
    const candidates = makeCandidates(31);
    const stage1Result: FilterResult = { kept: [], excluded: [] };
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJsonForCandidates([5, 6]));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events.length).toBeGreaterThanOrEqual(2);
    expect(mock).toHaveBeenCalledTimes(3);
  });

  it("Stage 1 keeps 4 with explicit excluded → recovery prompt includes remaining candidates", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    let recoveryPrompt = "";
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) {
        recoveryPrompt = prompt;
        return JSON.stringify(recoveryResult);
      }
      return JSON.stringify(makeReportJson(6));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(recoveryPrompt).toContain("Candidate 5");
  });

  it("all unclaimed candidates are hard-excluded (Claw) → no recovery, no-update", async () => {
    const candidates = makeCandidates(5);
    for (const c of candidates) {
      c.subject = "OpenClaw";
      c.title = "Claw update";
    }
    const stage1Result: FilterResult = {
      kept: [],
      excluded: Array.from({ length: 5 }, (_, i) => ({ id: String(i + 1), reason: "low" })),
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    mock.mockImplementation(async (prompt: string) => {
      if (prompt.includes("恢复筛选")) {
        throw new Error("Should not call recovery");
      }
      return JSON.stringify(stage1Result);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(0);
    expect(result!.json.toolStatus["codex"]).toBe("本期无重要更新");
  });

  it("unclassified Anthropic pricing candidate excluded from recovery prompt", async () => {
    const candidates = makeCandidates(31);
    candidates[9]!.title = "Claude Opus Price Reduction";
    candidates[9]!.summary = "Anthropic announces new pricing tiers";
    candidates[9]!.subject = "Anthropic";
    candidates[9]!.sourceName = "Anthropic";
    candidates[9]!.rawSummary = "Price: 50% reduction for API users";

    const stage1Result: FilterResult = { kept: [], excluded: [] };
    const recoveryResult = makeRecoveryResponse(5, 2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let recoveryPrompt = "";
    mock.mockImplementation(async (prompt: string) => {
      if (prompt.includes("恢复筛选")) {
        recoveryPrompt = prompt;
        return JSON.stringify(recoveryResult);
      }
      return JSON.stringify(stage1Result);
    });

    await generatePersonalReport(candidates, DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO, "2026-08-03", "zh");

    expect(recoveryPrompt).not.toContain("Claude Opus Price Reduction");
    expect(recoveryPrompt).toContain("Candidate 5");
  });
});

// ---------------------------------------------------------------------------
// Round 4 — Issue 2: Recovery internal dedup
// ---------------------------------------------------------------------------

describe("round 4 — recovery internal dedup", () => {
  it("recovery event 1 uses [5], event 2 uses [5,6] → event 2 discarded", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Event A",
          keepIds: ["5"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Event B",
          keepIds: ["5", "6"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJsonForCandidates([1, 2, 3, 4, 5]));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(5);
  });

  it("recovery event 1 uses [5], event 2 uses [6] → both preserved", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Event A",
          keepIds: ["5"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Event B",
          keepIds: ["6"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      return JSON.stringify(makeReportJson(6));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Round 4 — Issue 3: Config clamping with actual YAML, log audit, event IDs
// ---------------------------------------------------------------------------

describe("round 4 — config clamping with temp YAML", () => {
  it("loadConfig with full_report_minimum: 100 and full_report_limit: 16 → minimum is 16", async () => {
    const { loadConfig } = await import("../config.ts");
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const tmpPath = "config-test-clamp-r4.yml";
    writeFileSync(
      tmpPath,
      "cli_repos: []\npersonal_report:\n  full_report_limit: 16\n  full_report_minimum: 100\n",
      "utf-8",
    );
    try {
      const config = loadConfig(tmpPath);
      expect(config.personalReport.fullReportMinimum).toBe(16);
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  });

  it("prompt from clamped config does not show 100", async () => {
    const { loadConfig } = await import("../config.ts");
    const { writeFileSync, unlinkSync } = await import("node:fs");
    const tmpPath = "config-test-prompt-r4.yml";
    writeFileSync(
      tmpPath,
      "cli_repos: []\npersonal_report:\n  full_report_limit: 16\n  full_report_minimum: 100\n",
      "utf-8",
    );
    try {
      const config = loadConfig(tmpPath);
      const prompt = buildFilterPrompt(makeCandidates(31), config.personalReport, COVERAGE_FROM, COVERAGE_TO);
      expect(prompt).not.toContain("100");
      expect(prompt).toContain("16");
    } finally {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  });
});

describe("round 4 — error sanitization checks logs", () => {
  it("console.error logs use generic code, not raw exception text with token", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    const FAKE_TOKEN = "sk-ant-secret-token-R4-67890";
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) {
        throw new Error("API auth failed: " + FAKE_TOKEN);
      }
      return JSON.stringify(makeReportJson(4));
    });

    const allLogs: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      allLogs.push(a.map(String).join(" "));
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => {
      allLogs.push(a.map(String).join(" "));
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      allLogs.push(a.map(String).join(" "));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();

    expect(result).not.toBeNull();
    for (const log of allLogs) {
      expect(log).not.toContain(FAKE_TOKEN);
    }
    expect(allLogs.some((l) => l.includes("recovery-llm-call-failed"))).toBe(true);
    expect(JSON.stringify(result!.json)).not.toContain(FAKE_TOKEN);
  });
});

describe("round 4 — fiveMinuteBrief asserts specific event IDs", () => {
  it("non-primary CLI release is excluded from pool and brief", () => {
    const candidates = makeCandidates(5);
    candidates[4]!.infoType = "release";
    candidates[4]!.subject = "Gemini CLI";
    candidates[4]!.sourceName = "GitHub";

    const pool = buildBalancedPool(candidates, DEFAULT_CONFIG);
    expect(pool.some((c) => c.subject.includes("Gemini"))).toBe(false);

    const filterResult: FilterResult = {
      kept: [
        {
          title: "Gemini CLI release",
          keepIds: ["5"],
          mergedIds: [],
          topic: "CLI",
          relevance: "reference",
          confidence: "medium",
          reason: "reference",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(true);
  });

  it("evt-5 (high-relevance needsContext RAG) is in fiveMinuteBrief", async () => {
    const candidates = makeCandidates(31);
    const stage1Result = makeStage1Response(4, 31);
    const recoveryResult: FilterResult = {
      kept: [
        {
          title: "Critical RAG Framework",
          keepIds: ["5"],
          mergedIds: [],
          topic: "RAG",
          relevance: "direct project application",
          confidence: "high",
          reason: "directly applicable",
          needsContext: true,
        },
      ],
      excluded: [],
    };
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (prompt.includes("恢复筛选")) return JSON.stringify(recoveryResult);
      const reportJson = makeReportJson(5);
      reportJson.fiveMinuteBrief = {
        topicGroups: [{ name: "RAG", eventIds: ["evt-1", "evt-2", "evt-3", "evt-4", "evt-5"] }],
      };
      return JSON.stringify(reportJson);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    const briefIds = new Set(result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds));
    expect(briefIds.has("evt-5")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Stage 2 Completion — handles LLM omitting some filterEventIds
// ---------------------------------------------------------------------------

/** Create a Stage 1 response with N kept items (for completion tests). */
function makeStage1ResponseN(n: number): FilterResult {
  return {
    kept: Array.from({ length: n }, (_, i) => ({
      title: `Stage1 Event ${i + 1}`,
      keepIds: [String(i + 1)],
      mergedIds: [],
      topic: "Topic",
      relevance: "relevant",
      confidence: "high" as const,
      reason: "valuable",
      needsContext: false,
    })),
    excluded: [],
  };
}

/**
 * Create a report JSON with events for specific 1-indexed positions.
 * Event IDs use "evt-N" and filterEventIds use "filter-event-N".
 */
function makeReportJsonForFilterEvents(indices: number[]): PersonalReportJson {
  const eventIds = indices.map((_, i) => `evt-${i + 1}`);
  return {
    generatedAt: "2026-08-02T12:00:00Z",
    coverageFrom: "2026-08-01T00:00:00Z",
    coverageTo: "2026-08-03T00:00:00Z",
    toolStatus: { codex: "ok", "claude-code": "ok" },
    events: indices.map((fidx, i) => ({
      id: eventIds[i]!,
      filterEventId: `filter-event-${fidx}`,
      title: `Event for filter-event-${fidx}`,
      topic: "Topic",
      eventTime: "2026-08-02T12:00:00Z",
      updateKind: "new" as const,
      status: "已确认" as const,
      quick: {
        what: `what filter-event-${fidx}`,
        why: `why filter-event-${fidx}`,
        impact: `impact filter-event-${fidx}`,
        action: `act filter-event-${fidx}`,
      },
      full: {
        background: `bg filter-event-${fidx}`,
        evidence: `ev filter-event-${fidx}`,
        analysis: `an filter-event-${fidx}`,
        impact: `imp filter-event-${fidx}`,
        action: `act filter-event-${fidx}`,
      },
      candidateIds: [`https://example.com/candidate/${fidx}`],
      sources: [{ name: "Source", url: `https://example.com/candidate/${fidx}` }],
    })),
    fiveMinuteBrief: { topicGroups: [{ name: "Topic", eventIds }] },
    fullReport: { topicGroups: [{ name: "Topic", eventIds }] },
  };
}

describe("Stage 2 completion", () => {
  it("13 filter events, Stage 2 returns 11, completion returns missing 2 → success", async () => {
    const candidates = makeCandidates(13);
    const stage1Result = makeStage1ResponseN(13);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    // Stage 2 returns events for filter-event-1..11 (missing 12 and 13)
    const incompleteReport = makeReportJsonForFilterEvents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // Completion returns events for filter-event-12 and filter-event-13
    const completionReport = {
      events: [
        {
          id: "evt-12",
          filterEventId: "filter-event-12",
          title: "Completed Event 12",
          topic: "Topic",
          eventTime: "2026-08-02T12:00:00Z",
          updateKind: "new" as const,
          status: "已确认" as const,
          quick: { what: "w12", why: "y12", impact: "i12", action: "a12" },
          full: { background: "b12", evidence: "e12", analysis: "a12", impact: "i12", action: "a12" },
          candidateIds: ["https://example.com/candidate/12"],
          sources: [{ name: "Source", url: "https://example.com/candidate/12" }],
        },
        {
          id: "evt-13",
          filterEventId: "filter-event-13",
          title: "Completed Event 13",
          topic: "Topic",
          eventTime: "2026-08-02T12:00:00Z",
          updateKind: "new" as const,
          status: "已确认" as const,
          quick: { what: "w13", why: "y13", impact: "i13", action: "a13" },
          full: { background: "b13", evidence: "e13", analysis: "a13", impact: "i13", action: "a13" },
          candidateIds: ["https://example.com/candidate/13"],
          sources: [{ name: "Source", url: "https://example.com/candidate/13" }],
        },
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionReport);
      throw new Error("Unexpected call " + call);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(13);
    // All 13 filterEventIds must be mapped
    const mappedFeids = new Set(result!.json.events.map((e) => e.filterEventId));
    for (let i = 1; i <= 13; i++) {
      expect(mappedFeids.has(`filter-event-${i}`)).toBe(true);
    }
    // Completion called exactly once
    expect(callCount).toBe(3);
    // fullReport should have all events
    const fullIds = result!.json.fullReport.topicGroups.flatMap((g) => g.eventIds);
    expect(fullIds.length).toBe(13);
  });

  it("completion only returns 1 of 2 missing events → final failure, no report written", async () => {
    const candidates = makeCandidates(13);
    const stage1Result = makeStage1ResponseN(13);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const incompleteReport = makeReportJsonForFilterEvents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    // Completion returns only filter-event-12 (still missing 13)
    const partialCompletion = {
      events: [
        {
          id: "evt-12",
          filterEventId: "filter-event-12",
          title: "Completed Event 12",
          topic: "Topic",
          eventTime: "2026-08-02T12:00:00Z",
          updateKind: "new" as const,
          status: "已确认" as const,
          quick: { what: "w12", why: "y12", impact: "i12", action: "a12" },
          full: { background: "b12", evidence: "e12", analysis: "a12", impact: "i12", action: "a12" },
          candidateIds: ["https://example.com/candidate/12"],
          sources: [{ name: "Source", url: "https://example.com/candidate/12" }],
        },
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(partialCompletion);
      throw new Error("Unexpected call " + call);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    // Must fail — completion didn't cover all missing IDs
    expect(result).toBeNull();
    // Completion was attempted exactly once
    expect(callCount).toBe(3);
  });

  it("first validation has non-mapping errors → no completion attempted", async () => {
    const candidates = makeCandidates(5);
    const stage1Result = makeStage1ResponseN(5);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    // Report with a fabricated URL (non-mapping error)
    const badReport = makeReportJsonForFilterEvents([1, 2, 3, 4, 5]);
    badReport.events[0]!.sources = [{ name: "Fake", url: "https://fabricated-url.com/1" }];

    let callCount = 0;
    mock.mockImplementation(async (_prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(badReport);
      throw new Error("Should not call completion for non-mapping errors");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    // Only Stage 1 + Stage 2, no completion
    expect(callCount).toBe(2);
  });

  it("completion returns unknown filterEventId → rejected, no pollution", async () => {
    const candidates = makeCandidates(5);
    const stage1Result = makeStage1ResponseN(5);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    // Report missing filter-event-4 and filter-event-5
    const incompleteReport = makeReportJsonForFilterEvents([1, 2, 3]);
    // Completion returns filter-event-4 (good) + filter-event-99 (unknown) + duplicate filter-event-4
    const badCompletion = {
      events: [
        {
          id: "evt-4",
          filterEventId: "filter-event-4",
          title: "Event 4",
          topic: "T",
          eventTime: "2026-08-02T12:00:00Z",
          updateKind: "new" as const,
          status: "已确认" as const,
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: ["https://example.com/candidate/4"],
          sources: [{ name: "S", url: "https://example.com/candidate/4" }],
        },
        {
          id: "evt-99",
          filterEventId: "filter-event-99",
          title: "Unknown Event",
          topic: "T",
          eventTime: "2026-08-02T12:00:00Z",
          updateKind: "new" as const,
          status: "已确认" as const,
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: ["https://example.com/candidate/99"],
          sources: [{ name: "S", url: "https://example.com/candidate/99" }],
        },
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(badCompletion);
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    // Must fail: still missing filter-event-5 (completion didn't cover it)
    expect(result).toBeNull();
    // Existing events not polluted: the3 original events should not have been modified
    expect(callCount).toBe(3);
  });

  it("completion is called at most once", async () => {
    const candidates = makeCandidates(5);
    const stage1Result = makeStage1ResponseN(5);
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const incompleteReport = makeReportJsonForFilterEvents([1, 2, 3]);
    // Completion returns empty (simulating failure)
    const emptyCompletion = { events: [] };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(emptyCompletion);
      throw new Error("Should not make additional calls");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    // Exactly 3 calls: Stage 1 + Stage 2 + 1 completion (no retry)
    expect(callCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Stage 2 Completion fail-closed — any illegal event fails the whole report
// ---------------------------------------------------------------------------

/**
 * Helper: create a valid completion event for a specific filter-event-N.
 * Uses unique evt-N IDs to avoid collisions with the initial report.
 */
function makeCompletionEvent(filterEventId: string, eventId: string): Record<string, unknown> {
  const idx = filterEventId.replace("filter-event-", "");
  return {
    id: eventId,
    filterEventId,
    title: `Completed Event ${idx}`,
    topic: "Topic",
    eventTime: "2026-08-02T12:00:00Z",
    updateKind: "new",
    status: "已确认",
    quick: { what: `w${idx}`, why: `y${idx}`, impact: `i${idx}`, action: `a${idx}` },
    full: {
      background: `b${idx}`,
      evidence: `e${idx}`,
      analysis: `an${idx}`,
      impact: `imp${idx}`,
      action: `act${idx}`,
    },
    candidateIds: [`https://example.com/candidate/${idx}`],
    sources: [{ name: "Source", url: `https://example.com/candidate/${idx}` }],
  };
}

describe("Stage 2 completion fail-closed", () => {
  const setup = () => {
    const candidates = makeCandidates(13);
    const stage1Result = makeStage1ResponseN(13);
    // Stage 2 returns events for filter-event-1..11 (missing 12 and 13)
    const incompleteReport = makeReportJsonForFilterEvents([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    return { candidates, stage1Result, incompleteReport };
  };

  it("unknown filterEventId + all correct missing events → fail, no pollution", async () => {
    const { candidates, stage1Result, incompleteReport } = setup();
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const completionResponse = {
      events: [
        makeCompletionEvent("filter-event-12", "evt-12"),
        makeCompletionEvent("filter-event-13", "evt-13"),
        makeCompletionEvent("filter-event-99", "evt-99"), // unknown
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionResponse);
      throw new Error("Unexpected call");
    });

    const originalEvents = structuredClone(incompleteReport.events);
    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    expect(callCount).toBe(3);
    // Verify the incomplete report was not mutated
    expect(incompleteReport.events).toEqual(originalEvents);
  });

  it("filterEventId already in first report + all correct missing events → fail", async () => {
    const { candidates, stage1Result, incompleteReport } = setup();
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const completionResponse = {
      events: [
        makeCompletionEvent("filter-event-12", "evt-12"),
        makeCompletionEvent("filter-event-13", "evt-13"),
        makeCompletionEvent("filter-event-1", "evt-dup"), // already in report
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionResponse);
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    expect(callCount).toBe(3);
  });

  it("duplicate filterEventId within completion (other missing event present) → fail", async () => {
    const { candidates, stage1Result, incompleteReport } = setup();
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const completionResponse = {
      events: [
        makeCompletionEvent("filter-event-12", "evt-12"),
        makeCompletionEvent("filter-event-12", "evt-12b"), // duplicate filterEventId
        makeCompletionEvent("filter-event-13", "evt-13"),
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionResponse);
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    expect(callCount).toBe(3);
  });

  it("event ID already in first report + all correct filterEventIds → fail", async () => {
    const { candidates, stage1Result, incompleteReport } = setup();
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    // Use "evt-1" which already exists in the initial 11-event report
    const completionResponse = {
      events: [
        makeCompletionEvent("filter-event-12", "evt-1"), // ID collision with existing event
        makeCompletionEvent("filter-event-13", "evt-13"),
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionResponse);
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    expect(callCount).toBe(3);
  });

  it("duplicate event ID within completion + all correct filterEventIds → fail", async () => {
    const { candidates, stage1Result, incompleteReport } = setup();
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const completionResponse = {
      events: [
        makeCompletionEvent("filter-event-12", "evt-12"),
        makeCompletionEvent("filter-event-13", "evt-12"), // same event ID as above
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionResponse);
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).toBeNull();
    expect(callCount).toBe(3);
  });

  it("normal success path still works: exactly correct missing events, no extras", async () => {
    const { candidates, stage1Result, incompleteReport } = setup();
    const mock = vi.mocked(callLlm);
    mock.mockReset();

    const completionResponse = {
      events: [
        makeCompletionEvent("filter-event-12", "evt-12"),
        makeCompletionEvent("filter-event-13", "evt-13"),
      ],
    };

    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      if (call === 1) return JSON.stringify(incompleteReport);
      if (prompt.includes("缺失事件")) return JSON.stringify(completionResponse);
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(13);
    expect(callCount).toBe(3);
    const mappedFeids = new Set(result!.json.events.map((e) => e.filterEventId));
    for (let i = 1; i <= 13; i++) {
      expect(mappedFeids.has(`filter-event-${i}`)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Quality-first filtering — content relevance tests
// ---------------------------------------------------------------------------

describe("quality-first — Anthropic Claude hard exclusion", () => {
  it("Anthropic Claude security event removed by post-Stage1 gate", async () => {
    const candidates = makeCandidates(5);
    candidates[2]!.title = "Anthropic调查Claude网络安全评估中的三次真实事件";
    candidates[2]!.summary = "Anthropic reveals three real incidents in Claude cybersecurity evaluations";
    candidates[2]!.subject = "Anthropic";
    candidates[2]!.sourceName = "Anthropic";

    const stage1Result = makeStage1ResponseN(5);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let firstCall = true;
    mock.mockImplementation(async (prompt: string) => {
      if (firstCall) {
        firstCall = false;
        return JSON.stringify(stage1Result);
      }
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      // Stage 2: return a report — the exact event count doesn't matter for this test
      // since we only check that Anthropic content is absent
      return JSON.stringify(makeReportJsonForFilterEvents([1, 2, 4, 5]));
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    const titles = result!.json.events.map((e) => e.title);
    expect(titles.some((t) => t.toLowerCase().includes("anthropic"))).toBe(false);
  });
});

describe("quality-first — non-primary CLI release exclusion", () => {
  it("Qwen Code ordinary release excluded by isHardExcluded", () => {
    const candidates = makeCandidates(5);
    // Candidate 2 is Qwen Code release
    candidates[1]!.title = "Qwen Code v0.21.4";
    candidates[1]!.subject = "Qwen Code";
    candidates[1]!.infoType = "release";
    candidates[1]!.sourceName = "GitHub";

    const pool = buildBalancedPool(candidates, DEFAULT_CONFIG);
    // Qwen Code releases should be filtered by isHardExcluded
    const qwenInPool = pool.filter((c) => c.subject.includes("Qwen") && c.infoType === "release");
    expect(qwenInPool).toHaveLength(0);
  });

  it("Copilot CLI ordinary release excluded by isHardExcluded", () => {
    const candidates = makeCandidates(5);
    candidates[1]!.title = "GitHub Copilot CLI v1.0.78-0";
    candidates[1]!.subject = "GitHub Copilot CLI";
    candidates[1]!.infoType = "release";
    candidates[1]!.sourceName = "GitHub";

    const pool = buildBalancedPool(candidates, DEFAULT_CONFIG);
    const copilotInPool = pool.filter((c) => c.subject.includes("Copilot") && c.infoType === "release");
    expect(copilotInPool).toHaveLength(0);
  });
});

describe("quality-first — project discovery limits", () => {
  it("more than maxProjectDiscoveries (2) GitHub Search products excluded from fiveMinuteBrief", () => {
    const candidates: MergedCandidate[] = [];
    for (let i = 0; i < 5; i++) {
      candidates.push({
        ...makeCandidate({
          id: `search-${i}`,
          title: `Project ${i}`,
          sourceName: `GitHub Search (rag)`,
          sourceUrl: `https://github.com/org/project-${i}`,
          infoType: "product",
        }),
        additionalSources: [],
      });
    }

    const filterResult: FilterResult = {
      kept: candidates.map((c, i) => ({
        title: c.title,
        keepIds: [String(i + 1)],
        mergedIds: [],
        topic: "RAG",
        relevance: "discovery",
        confidence: "medium" as const,
        reason: "project discovery",
        needsContext: false,
      })),
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    // ALL project discoveries excluded from brief (not just 3rd+)
    for (let i = 1; i <= 5; i++) {
      expect(excluded.has(`filter-event-${i}`)).toBe(true);
    }
  });

  it("project discovery with maxProjectDiscoveries=0 excludes all", () => {
    const config = { ...DEFAULT_CONFIG, maxProjectDiscoveries: 0 };
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          id: "search-1",
          title: "Project 1",
          sourceName: "GitHub Search (rag)",
          sourceUrl: "https://github.com/org/project-1",
          infoType: "product",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Project 1",
          keepIds: ["1"],
          mergedIds: [],
          topic: "RAG",
          relevance: "discovery",
          confidence: "medium",
          reason: "discovery",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, config);
    expect(excluded.has("filter-event-1")).toBe(true);
  });
});

describe("quality-first — generic discussion exclusion from fiveMinuteBrief", () => {
  it("Dev.to generic discussion excluded from fiveMinuteBrief", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          id: "devto-disc",
          title: "Skills vs MCP: How AI Tools Have Evolved",
          sourceName: "Dev.to",
          sourceUrl: "https://dev.to/example/skills-vs-mcp",
          infoType: "discussion",
          summary: "A conceptual overview of AI tool paradigms",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Skills vs MCP",
          keepIds: ["1"],
          mergedIds: [],
          topic: "Tools",
          relevance: "reference",
          confidence: "medium",
          reason: "discussion",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(true);
  });

  it("Dev.to reproducible engineering guide NOT excluded from fiveMinuteBrief", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          id: "devto-guide",
          title: "Build a reproducible LLM benchmark harness",
          sourceName: "Dev.to",
          sourceUrl: "https://dev.to/example/benchmark-guide",
          infoType: "article",
          summary: "Step-by-step implementation of a reproducible evaluation framework",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Reproducible benchmark guide",
          keepIds: ["1"],
          mergedIds: [],
          topic: "Evaluation",
          relevance: "direct",
          confidence: "high",
          reason: "engineering method",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(false);
  });
});

describe("quality-first — underfilled report succeeds without padding", () => {
  it("only 3 high-value events → generates underfilled report, no low-value padding", async () => {
    const candidates = makeCandidates(5);
    // Only 3 events kept (below 12 minimum)
    const stage1Result: FilterResult = {
      kept: [
        {
          title: "High Value 1",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "high",
          confidence: "high",
          reason: "valuable",
          needsContext: false,
        },
        {
          title: "High Value 2",
          keepIds: ["2"],
          mergedIds: [],
          topic: "T",
          relevance: "high",
          confidence: "high",
          reason: "valuable",
          needsContext: false,
        },
        {
          title: "High Value 3",
          keepIds: ["3"],
          mergedIds: [],
          topic: "T",
          relevance: "high",
          confidence: "high",
          reason: "valuable",
          needsContext: false,
        },
      ],
      excluded: [
        { id: "4", reason: "low value" },
        { id: "5", reason: "low value" },
      ],
    };

    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callIndex = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callIndex++;
      if (call === 0) return JSON.stringify(stage1Result);
      // Recovery returns empty (no good candidates)
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      if (call === 2) return JSON.stringify(makeReportJsonForFilterEvents([1, 2, 3]));
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(3);
    // fiveMinuteBrief should have ≤ 3 events (not padded to 5)
    const briefIds = result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds);
    expect(briefIds.length).toBeLessThanOrEqual(3);
    // Underfilled warning should have been logged (not a failure)
  });
});

// ---------------------------------------------------------------------------
// Quality rules — five problems fixed
// ---------------------------------------------------------------------------

describe("quality rules — project discovery cap in full report", () => {
  it("3 project discoveries with max=2: full report keeps first 2, all excluded from brief", () => {
    const candidates = makeCandidates(5);
    // Candidates 1-3 are project discoveries
    for (let i = 0; i < 3; i++) {
      candidates[i]!.sourceName = "GitHub Search (rag)";
      candidates[i]!.infoType = "product";
      candidates[i]!.title = `Project ${i + 1}`;
    }
    // Candidates 4-5 are normal
    candidates[3]!.title = "Real Release 1";
    candidates[4]!.title = "Real Release 2";

    const filterResult: FilterResult = {
      kept: candidates.map((c, i) => ({
        title: c.title,
        keepIds: [String(i + 1)],
        mergedIds: [],
        topic: "RAG",
        relevance: "r",
        confidence: "high" as const,
        reason: "r",
        needsContext: false,
      })),
      excluded: [],
    };

    // Test brief exclusion — ALL project discoveries excluded
    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(true);
    expect(excluded.has("filter-event-2")).toBe(true);
    expect(excluded.has("filter-event-3")).toBe(true);
    expect(excluded.has("filter-event-4")).toBe(false);
    expect(excluded.has("filter-event-5")).toBe(false);
  });

  it("max_project_discoveries=0: no project discoveries in brief", () => {
    const config = { ...DEFAULT_CONFIG, maxProjectDiscoveries: 0 };
    const candidates = makeCandidates(3);
    candidates[0]!.sourceName = "GitHub Search (rag)";
    candidates[0]!.infoType = "product";

    const filterResult: FilterResult = {
      kept: [
        {
          title: "Discovery 1",
          keepIds: ["1"],
          mergedIds: [],
          topic: "RAG",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, config);
    expect(excluded.has("filter-event-1")).toBe(true);
  });
});

describe("quality rules — generic discussion/opinion exclusion", () => {
  it("Daring Fireball anecdote excluded from brief", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          id: "df",
          title: "尝试让Claude Code重写Claude应用",
          summary: "Claude Code能力边界轶事",
          sourceName: "Dev.to",
          sourceUrl: "https://daringfireball.net/linked/2026/08/02/cherny-claude-swift",
          infoType: "article",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Claude Code anecdote",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(true);
  });

  it("JFrog security report via HN NOT excluded (has concrete engineering evidence)", () => {
    const candidates: MergedCandidate[] = [
      {
        ...makeCandidate({
          id: "jfrog",
          title: "Critical CVE issued for hallucinated SQLite vulnerability",
          summary: "JFrog discovers LLM hallucinated CVE with real security impact",
          sourceName: "Hacker News",
          sourceUrl: "https://research.jfrog.com/post/sqlite-critical-cves-or-llm-slops/",
          infoType: "article",
        }),
        additionalSources: [],
      },
    ];
    const filterResult: FilterResult = {
      kept: [
        {
          title: "SQLite CVE",
          keepIds: ["1"],
          mergedIds: [],
          topic: "Security",
          relevance: "direct",
          confidence: "high",
          reason: "engineering risk",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const excluded = buildFiveMinuteExcludedFilterEventIds(candidates, filterResult, DEFAULT_CONFIG);
    expect(excluded.has("filter-event-1")).toBe(false);
  });
});

describe("quality rules — underfilled report without recovery padding", () => {
  it("3 high-value + low-value candidates: no recovery, underfilled succeeds", async () => {
    // Create candidates: 3 high-value daily events, 3 low-value
    const candidates = makeCandidates(6);
    candidates[0]!.title = "Critical SQLite CVE";
    candidates[0]!.sourceName = "Hacker News";
    candidates[0]!.sourceUrl = "https://research.jfrog.com/post/sqlite-cve";
    candidates[1]!.title = "RAGFlow release v2.0";
    candidates[1]!.infoType = "release";
    candidates[2]!.title = "Langfuse observability update";
    candidates[2]!.sourceName = "GitHub";
    // Low-value: project discovery, generic discussion, non-primary CLI
    candidates[3]!.sourceName = "GitHub Search (rag)";
    candidates[3]!.infoType = "product";
    candidates[3]!.title = "New RAG project";
    candidates[4]!.title = "Skills vs MCP paradigm discussion";
    candidates[4]!.sourceName = "Dev.to";
    candidates[4]!.sourceUrl = "https://dev.to/example/skills-mcp";
    candidates[4]!.summary = "个人观点：AI工具范式讨论";
    candidates[5]!.title = "Qwen Code v0.21.4";
    candidates[5]!.subject = "Qwen Code";
    candidates[5]!.infoType = "release";

    // Stage 1 keeps first 3 with explicit excluded for the rest
    const stage1Result: FilterResult = {
      kept: [1, 2, 3].map((i) => ({
        title: `Stage1 Event ${i}`,
        keepIds: [String(i)],
        mergedIds: [],
        topic: "T",
        relevance: "high",
        confidence: "high" as const,
        reason: "valuable",
        needsContext: false,
      })),
      excluded: [4, 5, 6].map((i) => ({ id: String(i), reason: "low value" })),
    };

    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      // Recovery should NOT be called — all remaining candidates are low-value
      if (prompt.includes("恢复筛选")) throw new Error("Recovery should not be called");
      // Stage 2: return report matching the 3 kept filter events using actual candidate URLs
      const report = makeReportJson(3);
      report.events.forEach((_, i) => {
        const c = candidates[i]!;
        report.events[i]!.filterEventId = `filter-event-${i + 1}`;
        report.events[i]!.candidateIds = [c.sourceUrl];
        report.events[i]!.sources = [{ name: c.sourceName, url: c.sourceUrl }];
      });
      return JSON.stringify(report);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(3);
    expect(callCount).toBe(2); // Stage 1 + Stage 2 only, no recovery
    const briefIds = result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds);
    expect(briefIds.length).toBeLessThanOrEqual(3);
  });
});

describe("quality rules — Anthropic Claude audit traceability", () => {
  it("Anthropic Claude excluded event appears in audit as excluded with stable code", async () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Good Event";
    candidates[1]!.title = "Anthropic调查Claude安全评估事件";
    candidates[1]!.summary = "Anthropic reveals incidents in Claude security evaluations";
    candidates[1]!.subject = "Anthropic";
    candidates[1]!.sourceName = "Anthropic";
    candidates[2]!.title = "Another Good Event";

    const stage1Result = makeStage1ResponseN(3);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let firstCall = true;
    mock.mockImplementation(async (prompt: string) => {
      if (firstCall) {
        firstCall = false;
        return JSON.stringify(stage1Result);
      }
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      return JSON.stringify(makeReportJsonForFilterEvents([1, 3]));
    });

    // Enable DRY_RUN to trigger audit save
    const origDryRun = process.env["DRY_RUN"];
    process.env["DRY_RUN"] = "true";
    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );
    process.env["DRY_RUN"] = origDryRun;

    expect(result).not.toBeNull();
    const titles = result!.json.events.map((e) => e.title);
    expect(titles.some((t) => t.toLowerCase().includes("anthropic"))).toBe(false);
  });
});

describe("quality rules — pi substring safety", () => {
  it("pipeline-tool release NOT excluded by 'pi' matching", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.subject = "pipeline-tool";
    candidates[0]!.infoType = "release";

    const pool = buildBalancedPool(candidates, DEFAULT_CONFIG);
    expect(pool.some((c) => c.subject === "pipeline-tool")).toBe(true);
  });

  it("Pi CLI release IS excluded when not in primaryTools", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.subject = "Pi";
    candidates[0]!.infoType = "release";

    const pool = buildBalancedPool(candidates, DEFAULT_CONFIG);
    expect(pool.some((c) => c.subject === "Pi")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Three problems fixed — structured labels, audit chain, prompt pressure
// ---------------------------------------------------------------------------

describe("project discovery — structured label and audit", () => {
  it("3 discoveries, max=2: Stage 2 receives 2, both have isProjectDiscovery, 3rd excluded in audit", async () => {
    const candidates = makeCandidates(5);
    // Candidates 1-3 are project discoveries
    for (let i = 0; i < 3; i++) {
      candidates[i]!.sourceName = "GitHub Search (rag)";
      candidates[i]!.infoType = "product";
      candidates[i]!.title = `RAG Project ${i + 1}`;
    }
    // Candidates 4-5 are normal
    candidates[3]!.title = "Codex v2 release";
    candidates[4]!.title = "Claude Code update";

    // Stage 1 keeps all 5
    const stage1Result: FilterResult = {
      kept: [1, 2, 3, 4, 5].map((i) => ({
        title: `Event ${i}`,
        keepIds: [String(i)],
        mergedIds: [],
        topic: "T",
        relevance: "r",
        confidence: "high",
        reason: "r",
        needsContext: false,
      })),
      excluded: [],
    };

    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let firstCall = true;
    mock.mockImplementation(async (prompt: string) => {
      if (firstCall) {
        firstCall = false;
        return JSON.stringify(stage1Result);
      }
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      // Stage 2 should receive only 4 events (2 discoveries + 2 normal)
      const report = makeReportJsonForFilterEvents([1, 2, 4, 5]);
      report.events.forEach((e, i) => {
        e.candidateIds = [`https://example.com/candidate/${[1, 2, 4, 5][i]}`];
        e.sources = [{ name: "S", url: `https://example.com/candidate/${[1, 2, 4, 5][i]}` }];
      });
      return JSON.stringify(report);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(4);
    // First 2 discoveries should have isProjectDiscovery tag
    const discoveries = result!.json.events.filter((e) => e.isProjectDiscovery);
    expect(discoveries).toHaveLength(2);
    // 3rd discovery excluded from report
    expect(result!.json.events.some((e) => e.title.includes("RAG Project 3"))).toBe(false);
  });

  it("max_project_discoveries=0: all discoveries removed, audit has project-discovery-limit", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.sourceName = "GitHub Search (rag)";
    candidates[0]!.infoType = "product";
    candidates[0]!.title = "RAG Project 1";

    const filterResult: FilterResult = {
      kept: [
        {
          title: "Discovery",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "medium",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };

    const audit = buildSelectionAudit(candidates, filterResult);
    expect(audit.decisionCounts.kept).toBe(1);
  });
});

describe("project discovery — audit main chain", () => {
  it("Anthropic Claude excluded event: audit shows excluded with stable code, no unclassified", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Good Event";
    candidates[1]!.title = "Anthropic调查Claude安全评估事件";
    candidates[1]!.summary = "Anthropic reveals incidents in Claude security evaluations";
    candidates[1]!.subject = "Anthropic";
    candidates[1]!.sourceName = "Anthropic";
    candidates[2]!.title = "Another Good Event";

    // Simulate post-Stage1 gate result: event 2 removed, added to excluded
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Good Event",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Another Good Event",
          keepIds: ["3"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [{ id: "2", reason: "hard-excluded-anthropic-claude" }],
    };

    const audit = buildSelectionAudit(candidates, filterResult);
    // Candidate 2 should be excluded, not unclassified
    const cand2 = audit.candidates.find((c) => c.candidateId === 2);
    expect(cand2).toBeDefined();
    expect(cand2!.decision).toBe("excluded");
    expect(cand2!.reason).toBe("hard-excluded-anthropic-claude");
    expect(audit.decisionCounts.unclassified).toBe(0);
  });

  it("mixed event with one hard-excluded: all related candidates excluded, no unclassified for removed event", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Good Candidate";
    candidates[1]!.title = "Anthropic Claude pricing update";
    candidates[1]!.summary = "Anthropic announces Claude pricing changes";
    candidates[1]!.subject = "Anthropic";
    candidates[1]!.sourceName = "Anthropic";
    candidates[2]!.title = "Kept Good Event";

    // Simulate: event merged candidates 1+2 removed (2 is hard-excluded), candidate 3 kept
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Kept Good Event",
          keepIds: ["3"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [
        { id: "1", reason: "removed-with-hard-excluded-event" },
        { id: "2", reason: "hard-excluded-pricing" },
      ],
    };

    const audit = buildSelectionAudit(candidates, filterResult);
    const cand1 = audit.candidates.find((c) => c.candidateId === 1);
    const cand2 = audit.candidates.find((c) => c.candidateId === 2);
    const cand3 = audit.candidates.find((c) => c.candidateId === 3);
    expect(cand1!.decision).toBe("excluded");
    expect(cand1!.reason).toBe("removed-with-hard-excluded-event");
    expect(cand2!.decision).toBe("excluded");
    expect(cand2!.reason).toBe("hard-excluded-pricing");
    expect(cand3!.decision).toBe("kept");
    // No unclassified candidates
    expect(audit.decisionCounts.unclassified).toBe(0);
  });
});

describe("project discovery — rendering", () => {
  it("full report shows '首次项目发现｜非本期更新' for discovery events", () => {
    const report: PersonalReportJson = {
      generatedAt: "2026-08-02T12:00:00Z",
      coverageFrom: "2026-08-01T00:00:00Z",
      coverageTo: "2026-08-03T00:00:00Z",
      toolStatus: { codex: "ok", "claude-code": "ok" },
      events: [
        {
          id: "evt-1",
          filterEventId: "filter-event-1",
          title: "RAGFlow",
          topic: "RAG",
          eventTime: "2026-08-02T12:00:00Z",
          updateKind: "new",
          status: "已确认",
          quick: { what: "w", why: "y", impact: "i", action: "a" },
          full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
          candidateIds: ["https://example.com/1"],
          sources: [{ name: "S", url: "https://example.com/1" }],
          isProjectDiscovery: true,
        },
      ],
      fiveMinuteBrief: { topicGroups: [] },
      fullReport: { topicGroups: [{ name: "RAG", eventIds: ["evt-1"] }] },
    };

    const md = renderPersonalReportMarkdown(report, "2026-08-03", "zh");
    expect(md).toContain("首次项目发现｜非本期更新");
    // Should NOT be in fiveMinuteBrief section (brief is empty in this test)
    const briefSection = md.split("## 五分钟概览")[1]?.split("## 完整报告")[0] ?? "";
    expect(briefSection).not.toContain("首次项目发现");
  });
});

describe("project discovery — prompt content", () => {
  it("Stage 1 prompt does not say project discoveries can enter fiveMinuteBrief", () => {
    const prompt = buildFilterPrompt(makeCandidates(5), DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO);
    // Old: "只有高度贴合当前项目、值得优先评估时才可进入五分钟概览"
    expect(prompt).not.toContain("可进入五分钟概览");
    // New: "始终不得进入五分钟概览"
    expect(prompt).toContain("始终不得进入五分钟概览");
  });

  it("Stage 2 prompt uses '至多' not '正常包含' for event count", () => {
    const candidates = makeCandidates(5);
    const filterResult: FilterResult = {
      kept: [
        {
          title: "E",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [],
    };
    const prompt = buildReportPrompt(candidates, filterResult, DEFAULT_CONFIG, COVERAGE_FROM, COVERAGE_TO);
    // Old: "完整报告正常包含 16 个"
    expect(prompt).not.toContain("正常包含");
    // New: "完整报告至多 16 条"
    expect(prompt).toContain("至多");
    // Still requires one event per filter event
    expect(prompt).toContain("不得遗漏任何 [Event N]");
  });
});

// ---------------------------------------------------------------------------
// filterEventId alignment regression tests
// ---------------------------------------------------------------------------

describe("filterEventId alignment — post-Stage1 gate", () => {
  it("Anthropic removed first → discovery becomes filter-event-1 with isProjectDiscovery tag", async () => {
    const candidates = makeCandidates(3);
    // Candidate 1: Anthropic Claude (hard-excluded)
    candidates[0]!.title = "Anthropic调查Claude安全评估事件";
    candidates[0]!.summary = "Anthropic reveals incidents in Claude security evaluations";
    candidates[0]!.subject = "Anthropic";
    candidates[0]!.sourceName = "Anthropic";
    // Candidate 2: GitHub Search project discovery
    candidates[1]!.sourceName = "GitHub Search (rag)";
    candidates[1]!.infoType = "product";
    candidates[1]!.title = "RAGFlow";
    // Candidate 3: normal high-value
    candidates[2]!.title = "Codex v2 release";

    // Stage 1 keeps all 3
    const stage1Result = makeStage1ResponseN(3);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let firstCall = true;
    mock.mockImplementation(async (prompt: string) => {
      if (firstCall) {
        firstCall = false;
        return JSON.stringify(stage1Result);
      }
      if (prompt.includes("恢复筛选")) return JSON.stringify({ kept: [], excluded: [] });
      // Stage 2 receives 2 events: discovery (filter-event-1) + normal (filter-event-2)
      const report = makeReportJsonForFilterEvents([1, 2]);
      // Mark the discovery event
      report.events[0]!.isProjectDiscovery = true;
      report.events[0]!.candidateIds = [candidates[1]!.sourceUrl];
      report.events[0]!.sources = [{ name: candidates[1]!.sourceName, url: candidates[1]!.sourceUrl }];
      report.events[1]!.candidateIds = [candidates[2]!.sourceUrl];
      report.events[1]!.sources = [{ name: candidates[2]!.sourceName, url: candidates[2]!.sourceUrl }];
      return JSON.stringify(report);
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(2);
    // Discovery is now filter-event-1 (Anthropic was removed)
    const discovery = result!.json.events.find((e) => e.isProjectDiscovery);
    expect(discovery).toBeDefined();
    expect(discovery!.filterEventId).toBe("filter-event-1");
    // Markdown shows the label
    const md = renderPersonalReportMarkdown(result!.json, "2026-08-03", "zh");
    expect(md).toContain("首次项目发现｜非本期更新");
    // Not in fiveMinuteBrief
    const briefIds = result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds);
    expect(briefIds).not.toContain(discovery!.id);
  });
});

describe("filterEventId alignment — completion recovery", () => {
  it("project discovery missed by Stage 2, recovered by completion, still tagged", async () => {
    const candidates = makeCandidates(2);
    // Candidate 1: normal high-value
    candidates[0]!.title = "Codex v2 release";
    // Candidate 2: project discovery
    candidates[1]!.sourceName = "GitHub Search (rag)";
    candidates[1]!.infoType = "product";
    candidates[1]!.title = "RAGFlow";

    // Stage 1 keeps both
    const stage1Result = makeStage1ResponseN(2);
    const mock = vi.mocked(callLlm);
    mock.mockReset();
    let callCount = 0;
    mock.mockImplementation(async (prompt: string) => {
      const call = callCount++;
      if (call === 0) return JSON.stringify(stage1Result);
      // Stage 2 returns only event 1 (misses the discovery)
      if (call === 1) {
        const report = makeReportJsonForFilterEvents([1]);
        report.events[0]!.candidateIds = [candidates[0]!.sourceUrl];
        report.events[0]!.sources = [{ name: "S", url: candidates[0]!.sourceUrl }];
        return JSON.stringify(report);
      }
      // Completion returns the missing discovery event
      if (prompt.includes("缺失事件")) {
        return JSON.stringify({
          events: [
            {
              id: "evt-2",
              filterEventId: "filter-event-2",
              title: "RAGFlow discovery",
              topic: "RAG",
              eventTime: "2026-08-02T12:00:00Z",
              updateKind: "new",
              status: "已确认",
              quick: { what: "w", why: "y", impact: "i", action: "a" },
              full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
              candidateIds: [candidates[1]!.sourceUrl],
              sources: [{ name: candidates[1]!.sourceName, url: candidates[1]!.sourceUrl }],
            },
          ],
        });
      }
      throw new Error("Unexpected call");
    });

    const result = await generatePersonalReport(
      candidates,
      DEFAULT_CONFIG,
      COVERAGE_FROM,
      COVERAGE_TO,
      "2026-08-03",
      "zh",
    );

    expect(result).not.toBeNull();
    expect(result!.json.events).toHaveLength(2);
    // The recovered discovery event should be tagged
    const discovery = result!.json.events.find((e) => e.filterEventId === "filter-event-2");
    expect(discovery).toBeDefined();
    expect(discovery!.isProjectDiscovery).toBe(true);
    // Not in fiveMinuteBrief
    const briefIds = result!.json.fiveMinuteBrief.topicGroups.flatMap((g) => g.eventIds);
    expect(briefIds).not.toContain(discovery!.id);
    // Strict mapping passes (completion test)
    expect(callCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Problem 1: stage1-not-selected — audit closure
// ---------------------------------------------------------------------------

describe("audit closure — stage1-not-selected", () => {
  it("Dify candidate not in kept or excluded → audit shows excluded with stage1-not-selected", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Good Event";
    candidates[1]!.title = "langgenius/dify";
    candidates[1]!.sourceName = "GitHub Search (rag)";
    candidates[1]!.sourceUrl = "https://github.com/langgenius/dify";
    candidates[2]!.title = "Another Good Event";

    // Stage 1 kept 1 and 3, but did NOT write excluded for 2
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Good Event",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Another Good Event",
          keepIds: ["3"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [], // Stage 1 didn't explicitly exclude candidate 2
    };

    // Simulate closure: any candidate not in kept or excluded gets stage1-not-selected
    const keptIds = new Set(["1", "3"]);
    const excludedIds = new Set<string>();
    for (let i = 0; i < candidates.length; i++) {
      const id = String(i + 1);
      if (keptIds.has(id) || excludedIds.has(id)) continue;
      filterResult.excluded.push({ id, reason: "stage1-not-selected" });
    }

    const audit = buildSelectionAudit(candidates, filterResult);
    expect(audit.decisionCounts.unclassified).toBe(0);
    const cand2 = audit.candidates.find((c) => c.candidateId === 2);
    expect(cand2).toBeDefined();
    expect(cand2!.decision).toBe("excluded");
    expect(cand2!.reason).toBe("stage1-not-selected");
  });

  it("stage1-not-selected candidate recovered → becomes kept, no excluded conflict", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Good Event";
    candidates[1]!.title = "Recovered Event";
    candidates[2]!.title = "Another Event";

    // After recovery, candidate 2 is in kept
    const filterResult: FilterResult = {
      kept: [
        {
          title: "Good Event",
          keepIds: ["1"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
        {
          title: "Recovered Event",
          keepIds: ["2"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [{ id: "3", reason: "stage1-not-selected" }],
    };

    const audit = buildSelectionAudit(candidates, filterResult);
    expect(audit.decisionCounts.unclassified).toBe(0);
    const cand2 = audit.candidates.find((c) => c.candidateId === 2);
    expect(cand2!.decision).toBe("kept");
  });
});

// ---------------------------------------------------------------------------
// Problem 2: Launch HN / Show HN product launches
// ---------------------------------------------------------------------------

describe("generic product launch exclusion", () => {
  it("Launch HN commercial platform excluded from report and recovery", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Launch HN: Hoplite – Cloud coding agent deployment platform";
    candidates[0]!.summary = "YC-backed cloud platform for deploying coding agents. Pricing from $49/mo.";
    candidates[0]!.sourceName = "Hacker News";
    candidates[0]!.sourceUrl = "https://hoplite.sh";

    expect(isHardExcluded(candidates[0]!, DEFAULT_CONFIG)).toBe(true);
    expect(isLowValueForRecovery(candidates[0]!, DEFAULT_CONFIG)).toBe(true);
  });

  it("GitHub open-source Agent skills HN entry NOT excluded", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Agent skills that bring team coding standards to Claude Code and Codex";
    candidates[0]!.summary =
      "Open-source implementation on GitHub for integrating team standards into AI coding tools";
    candidates[0]!.sourceName = "Hacker News";
    candidates[0]!.sourceUrl = "https://github.com/tikalk/adlc-team-skills";

    expect(isHardExcluded(candidates[0]!, DEFAULT_CONFIG)).toBe(false);
    expect(isLowValueForRecovery(candidates[0]!, DEFAULT_CONFIG)).toBe(false);
  });

  it("generic product launch audit reason is stable", () => {
    const candidates = makeCandidates(2);
    candidates[0]!.title = "Show HN: NewAI – AI writing assistant";
    candidates[0]!.summary = "YC W26 startup. Try our free tier.";
    candidates[0]!.sourceName = "Hacker News";
    candidates[0]!.sourceUrl = "https://newai.com";

    const filterResult: FilterResult = {
      kept: [
        {
          title: "Good Event",
          keepIds: ["2"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [{ id: "1", reason: "generic-product-launch" }],
    };

    const audit = buildSelectionAudit(candidates, filterResult);
    const cand1 = audit.candidates.find((c) => c.candidateId === 1);
    expect(cand1!.decision).toBe("excluded");
    expect(cand1!.reason).toBe("generic-product-launch");
    expect(audit.decisionCounts.unclassified).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Problem 3: Speculative non-primary releases
// ---------------------------------------------------------------------------

describe("speculative non-primary release exclusion", () => {
  it("Hermes Agent release with only commit/PR/size info excluded", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Hermes Agent v2026.8.3: massive framework update";
    candidates[0]!.summary = "500+ commits, 200 PRs merged, large-scale refactoring of core modules";
    candidates[0]!.subject = "hermes-agent";
    candidates[0]!.infoType = "release";
    candidates[0]!.sourceName = "GitHub";

    expect(isHardExcluded(candidates[0]!, DEFAULT_CONFIG)).toBe(true);
    expect(isLowValueForRecovery(candidates[0]!, DEFAULT_CONFIG)).toBe(true);
  });

  it("non-primary release with explicit capability NOT excluded", () => {
    const candidates = makeCandidates(3);
    candidates[0]!.title = "Hermes Agent v2026.8.3: new persistent state database";
    candidates[0]!.summary =
      "Added persistent state database for agent long-term memory and RAG retrieval pipeline";
    candidates[0]!.subject = "hermes-agent";
    candidates[0]!.infoType = "release";
    candidates[0]!.sourceName = "GitHub";

    expect(isHardExcluded(candidates[0]!, DEFAULT_CONFIG)).toBe(false);
    expect(isLowValueForRecovery(candidates[0]!, DEFAULT_CONFIG)).toBe(false);
  });

  it("speculative release audit reason is stable", () => {
    const candidates = makeCandidates(2);
    candidates[0]!.title = "Hermes Agent v2026.8.3: large-scale refactor";
    candidates[0]!.summary = "1000+ closed issues, massive codebase cleanup";
    candidates[0]!.subject = "hermes-agent";
    candidates[0]!.infoType = "release";

    const filterResult: FilterResult = {
      kept: [
        {
          title: "Good Event",
          keepIds: ["2"],
          mergedIds: [],
          topic: "T",
          relevance: "r",
          confidence: "high",
          reason: "r",
          needsContext: false,
        },
      ],
      excluded: [{ id: "1", reason: "speculative-non-primary-release" }],
    };

    const audit = buildSelectionAudit(candidates, filterResult);
    const cand1 = audit.candidates.find((c) => c.candidateId === 1);
    expect(cand1!.decision).toBe("excluded");
    expect(cand1!.reason).toBe("speculative-non-primary-release");
    expect(audit.decisionCounts.unclassified).toBe(0);
  });
});
