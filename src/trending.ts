/**
 * GitHub trending and AI topic search data fetching.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendingRepo {
  fullName: string;
  description: string;
  language: string;
  todayStars: number;
  totalStars: number;
  forks: number;
  url: string;
}

export interface SearchRepo {
  fullName: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  pushedAt: string;
  url: string;
  searchQuery: string;
  /** GitHub topics, when the API response includes them. */
  topics?: string[];
}

export interface TrendingData {
  trendingRepos: TrendingRepo[];
  searchRepos: SearchRepo[];
  trendingFetchSuccess: boolean;
  /** Snapshot markers for dedup in subsequent runs. */
  snapshotMarkers: TrendingSnapshot;
}

/** Stored in report-state.json to detect new/changed trending repos. */
export interface TrendingSnapshot {
  /** Set of fullNames that appeared in the trending page. */
  trendingNames: string[];
  /** fullName → totalStars from the previous snapshot. */
  starCounts: Record<string, number>;
  /** Focus-search projects already surfaced in a previous report. */
  searchNames?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEARCH_QUERIES = [
  { q: "topic:rag", label: "rag" },
  { q: "topic:graphrag", label: "graphrag" },
  { q: "topic:agent-memory", label: "agent-memory" },
  { q: "topic:context-engineering", label: "context-engineering" },
  { q: "topic:llm-evaluation", label: "llm-evaluation" },
  { q: "topic:mcp-server", label: "mcp-server" },
  { q: "topic:vector-database", label: "vector-db" },
];

// ---------------------------------------------------------------------------
// GitHub Trending HTML fetch
// ---------------------------------------------------------------------------

async function fetchGitHubTrending(): Promise<{ repos: TrendingRepo[]; success: boolean }> {
  try {
    const resp = await fetch("https://github.com/trending?since=daily&spoken_language_code=", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; agents-radar/1.0)",
        Accept: "text/html",
      },
    });
    if (!resp.ok) {
      console.error(`  [trending] HTTP ${resp.status} fetching github.com/trending`);
      return { repos: [], success: false };
    }

    const html = await resp.text();
    const repos: TrendingRepo[] = [];

    // Split by article blocks
    const articlePattern =
      /<article[^>]*class="[^"]*Box-row[^"]*"[\s\S]*?(?=<article[^>]*class="[^"]*Box-row[^"]*"|$)/g;
    const blocks = html.match(articlePattern) ?? [];

    for (const block of blocks) {
      try {
        // fullName from <h2> > <a href="/owner/repo">
        const nameMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="\/([^/"]+\/[^/"]+)"/);
        if (!nameMatch?.[1]) continue;
        const fullName = nameMatch[1].trim();

        // description from col-9 paragraph
        const descMatch = block.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
        const description = descMatch?.[1] ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // language
        const langMatch = block.match(/<span[^>]+itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/);
        const language = langMatch?.[1] ? langMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // today stars
        const todayMatch = block.match(/([\d,]+)\s+stars?\s+today/i);
        const todayStars = todayMatch?.[1] ? parseInt(todayMatch[1].replace(/,/g, ""), 10) : 0;

        // total stars — look for link with /stargazers
        const totalMatch = block.match(/href="\/[^"]+\/stargazers"[^>]*>\s*<[^>]+>\s*([\d,]+)/);
        const totalStars = totalMatch?.[1] ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : 0;

        // forks
        const forkMatch = block.match(/href="\/[^"]+\/forks"[^>]*>\s*<[^>]+>\s*([\d,]+)/);
        const forks = forkMatch?.[1] ? parseInt(forkMatch[1].replace(/,/g, ""), 10) : 0;

        repos.push({
          fullName,
          description,
          language,
          todayStars,
          totalStars,
          forks,
          url: `https://github.com/${fullName}`,
        });
      } catch {
        // single block parse failure is non-fatal
      }
    }

    if (repos.length === 0) {
      console.error("  [trending] Parsed 0 repos — HTML structure may have changed");
      return { repos: [], success: false };
    }

    console.log(`  [trending] Parsed ${repos.length} trending repos from HTML`);
    return { repos, success: true };
  } catch (err) {
    console.error(`  [trending] Fetch failed: ${err}`);
    return { repos: [], success: false };
  }
}

// ---------------------------------------------------------------------------
// GitHub Search API
// ---------------------------------------------------------------------------

interface SearchApiItem {
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  html_url: string;
  topics?: string[];
}

interface SearchApiResponse {
  items: SearchApiItem[];
}

async function searchAiRepos(sevenDaysAgo: string): Promise<SearchRepo[]> {
  const token = process.env["GITHUB_TOKEN"] ?? "";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const seen = new Set<string>();
  const all: SearchRepo[] = [];

  await Promise.all(
    SEARCH_QUERIES.map(async ({ q, label }) => {
      try {
        const query = `${q}+pushed:>${sevenDaysAgo}&sort=stars&order=desc`;
        const url = `https://api.github.com/search/repositories?q=${query}&per_page=15`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          console.error(`  [trending/search] "${label}": HTTP ${resp.status}`);
          return;
        }
        const data = (await resp.json()) as SearchApiResponse;
        let added = 0;
        for (const item of data.items ?? []) {
          if (!seen.has(item.full_name)) {
            seen.add(item.full_name);
            all.push({
              fullName: item.full_name,
              description: item.description,
              language: item.language,
              stargazersCount: item.stargazers_count,
              pushedAt: item.pushed_at,
              url: item.html_url,
              searchQuery: label,
              ...(item.topics && item.topics.length > 0 ? { topics: item.topics } : {}),
            });
            added++;
          }
        }
        console.log(`  [trending/search] "${label}": ${added} new repos`);
      } catch (err) {
        console.error(`  [trending/search] "${label}": ${err}`);
      }
    }),
  );

  return all;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function filterSearchReposForSnapshot(
  repos: SearchRepo[],
  previousSnapshot?: TrendingSnapshot,
): SearchRepo[] {
  if (!previousSnapshot?.searchNames) return repos;
  const previousNames = new Set(previousSnapshot.searchNames);
  return repos.filter((repo) => !previousNames.has(repo.fullName));
}

export async function fetchTrendingData(previousSnapshot?: TrendingSnapshot): Promise<TrendingData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [{ repos: allTrendingRepos, success }, searchRepos] = await Promise.all([
    fetchGitHubTrending(),
    searchAiRepos(sevenDaysAgo),
  ]);

  // Build new snapshot markers
  const newSnapshot: TrendingSnapshot = {
    trendingNames: allTrendingRepos.map((r) => r.fullName),
    starCounts: Object.fromEntries(allTrendingRepos.map((r) => [r.fullName, r.totalStars])),
    searchNames: searchRepos.map((r) => r.fullName),
  };

  // Filter trending repos: only new entrants or significant star growth
  const prevNames = previousSnapshot ? new Set(previousSnapshot.trendingNames) : null;
  const prevStars = previousSnapshot?.starCounts ?? {};

  const trendingRepos = prevNames
    ? allTrendingRepos.filter((r) => {
        if (!prevNames.has(r.fullName)) return true; // new entrant
        const prev = prevStars[r.fullName] ?? 0;
        const growth = r.totalStars - prev;
        return growth > 50 || (prev > 0 && growth / prev > 0.2); // significant growth
      })
    : allTrendingRepos;

  return {
    trendingRepos,
    searchRepos: filterSearchReposForSnapshot(searchRepos, previousSnapshot),
    trendingFetchSuccess: success,
    snapshotMarkers: newSnapshot,
  };
}
