import { describe, expect, it } from "vitest";

import { filterSearchReposForSnapshot } from "../trending.ts";
import type { SearchRepo, TrendingSnapshot } from "../trending.ts";

describe("filterSearchReposForSnapshot", () => {
  const repo = (fullName: string): SearchRepo => ({
    fullName,
    description: "Agent memory project",
    language: "TypeScript",
    stargazersCount: 100,
    pushedAt: "2026-08-01T00:00:00Z",
    url: `https://github.com/${fullName}`,
    searchQuery: "agent-memory",
  });

  it("keeps all focus-search discoveries before a search snapshot exists", () => {
    const previous: TrendingSnapshot = { trendingNames: [], starCounts: {} };

    expect(filterSearchReposForSnapshot([repo("a/one"), repo("b/two")], previous)).toHaveLength(2);
  });

  it("does not repeat a project already reported by focus search", () => {
    const previous: TrendingSnapshot = {
      trendingNames: [],
      starCounts: {},
      searchNames: ["a/one"],
    };

    expect(
      filterSearchReposForSnapshot([repo("a/one"), repo("b/two")], previous).map((item) => item.fullName),
    ).toEqual(["b/two"]);
  });
});
