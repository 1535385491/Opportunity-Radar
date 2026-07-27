/**
 * agents-radar: unified personal AI digest generator.
 *
 * Pipeline: fetch → extract candidates → merge/dedup → LLM → JSON + Markdown
 *
 * Env vars:
 *   LLM_PROVIDER        - "anthropic" | "openai" | "github-copilot" | "openrouter" (default: anthropic)
 *   GITHUB_TOKEN        - GitHub token for API access and issue creation
 *   DIGEST_REPO         - owner/repo where digest issues are posted (optional)
 *
 * Provider-specific env vars — see src/providers/ for full list.
 */

import {
  type GitHubItem,
  type RepoFetch,
  fetchRecentItems,
  fetchRecentReleases,
  fetchSkillsData,
  createGitHubIssue,
} from "./github.ts";
import { saveFile } from "./report.ts";
import { loadWebState, fetchSiteContent, saveWebState, type WebFetchResult, type WebState } from "./web.ts";
import { fetchTrendingData, type TrendingData, type TrendingSnapshot } from "./trending.ts";
import { fetchHnData, type HnData } from "./hn.ts";
import { fetchPhData, type PhData } from "./ph.ts";
import { fetchArxivData, type ArxivData } from "./arxiv.ts";
import { fetchHfData, type HfData, type HfSnapshot } from "./hf.ts";
import { fetchDevtoData, type DevtoData } from "./devto.ts";
import { fetchLobstersData, type LobstersData } from "./lobsters.ts";
import { loadConfig, type RadarConfig } from "./config.ts";
import { toCstDateStr } from "./date.ts";
import {
  loadReportState,
  saveReportState,
  calculateSince,
  updateStateAfterSuccess,
  checkSameDay,
  updateSourceStates,
} from "./report-state.ts";
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
  buildBalancedPool,
  generatePersonalReport,
  extractTrendingSnapshot,
  extractHfSnapshot,
  type CandidateItem,
  type PersonalReportJson,
} from "./personal-report.ts";

// ---------------------------------------------------------------------------
// Repo config — loaded from config.yml, falls back to built-in defaults
// ---------------------------------------------------------------------------

const config: RadarConfig = loadConfig();
const {
  cliRepos: CLI_REPOS,
  skillsRepo: CLAUDE_SKILLS_REPO,
  openclaw: OPENCLAW,
  openclawPeers: OPENCLAW_PEERS,
  personalReport: PERSONAL_CONFIG,
} = config;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// Phase 1: Fetch (with unified `since` window)
// ---------------------------------------------------------------------------

async function fetchAllData(
  since: string,
  webState: WebState,
  prevTrending?: TrendingSnapshot,
  prevHf?: HfSnapshot,
): Promise<{
  fetched: RepoFetch[];
  skillsData: { prs: GitHubItem[]; issues: GitHubItem[] };
  webResults: WebFetchResult[];
  trendingData: TrendingData;
  hnData: HnData;
  phData: PhData;
  arxivData: ArxivData;
  hfData: HfData;
  devtoData: DevtoData;
  lobstersData: LobstersData;
}> {
  const sinceDate = new Date(since);
  const allConfigs = [...CLI_REPOS, OPENCLAW, ...OPENCLAW_PEERS];
  console.log(
    `  Tracking: ${allConfigs.map((r) => r.id).join(", ")}, claude-code-skills, web, hn, ph, arxiv, hf, devto, lobsters`,
  );
  console.log(`  Collection window: ${since}`);

  const [
    fetched,
    skillsData,
    webResults,
    trendingData,
    hnData,
    phData,
    arxivData,
    hfData,
    devtoData,
    lobstersData,
  ] = await Promise.all([
    Promise.all(
      allConfigs.map(async (cfg) => {
        try {
          const [issuesRaw, prs, releases] = await Promise.all([
            fetchRecentItems(cfg, "issues", sinceDate),
            fetchRecentItems(cfg, "pulls", sinceDate),
            fetchRecentReleases(cfg.repo, sinceDate),
          ]);
          const issues = issuesRaw.filter((i) => !i.pull_request);
          console.log(
            `  [${cfg.id}] issues: ${issues.length}, prs: ${prs.length}, releases: ${releases.length}`,
          );
          return { cfg, issues, prs, releases };
        } catch (err) {
          console.error(`  [${cfg.id}] fetch failed: ${err}`);
          return { cfg, issues: [], prs: [], releases: [] };
        }
      }),
    ),
    fetchSkillsData(CLAUDE_SKILLS_REPO)
      .then((d) => {
        console.log(`  [claude-code-skills] prs: ${d.prs.length}, issues: ${d.issues.length}`);
        return d;
      })
      .catch((err) => {
        console.error(`  [claude-code-skills] fetch failed: ${err}`);
        return { prs: [] as GitHubItem[], issues: [] as GitHubItem[] };
      }),
    Promise.all([
      fetchSiteContent("anthropic", webState, since).catch((err): WebFetchResult => {
        console.error(`  [web/anthropic] fetch failed: ${err}`);
        return {
          site: "anthropic",
          siteName: "Anthropic (Claude)",
          isFirstRun: false,
          newItems: [],
          totalDiscovered: 0,
        };
      }),
      fetchSiteContent("openai", webState, since).catch((err): WebFetchResult => {
        console.error(`  [web/openai] fetch failed: ${err}`);
        return { site: "openai", siteName: "OpenAI", isFirstRun: false, newItems: [], totalDiscovered: 0 };
      }),
    ]),
    fetchTrendingData(prevTrending).catch(
      (): TrendingData => ({
        trendingRepos: [],
        searchRepos: [],
        trendingFetchSuccess: false,
        snapshotMarkers: { trendingNames: [], starCounts: {} },
      }),
    ),
    fetchHnData(since).catch((): HnData => ({ stories: [], fetchSuccess: false })),
    fetchPhData(since).catch((): PhData => ({ products: [], fetchSuccess: false })),
    fetchArxivData(since).catch((): ArxivData => ({ papers: [], fetchSuccess: false })),
    fetchHfData(prevHf).catch((): HfData => ({ models: [], fetchSuccess: false, snapshotMarkers: { modelIds: [], likeCounts: {} } })),
    fetchDevtoData(since).catch((): DevtoData => ({ articles: [], fetchSuccess: false })),
    fetchLobstersData(since).catch((): LobstersData => ({ stories: [], fetchSuccess: false })),
  ]);

  return {
    fetched,
    skillsData,
    webResults,
    trendingData,
    hnData,
    phData,
    arxivData,
    hfData,
    devtoData,
    lobstersData,
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Extract candidates and build balanced pool
// ---------------------------------------------------------------------------

function extractAllCandidates(
  fetched: RepoFetch[],
  skillsData: { prs: GitHubItem[]; issues: GitHubItem[] },
  webResults: WebFetchResult[],
  trendingData: TrendingData,
  hnData: HnData,
  phData: PhData,
  arxivData: ArxivData,
  hfData: HfData,
  devtoData: DevtoData,
  lobstersData: LobstersData,
): CandidateItem[] {
  const candidates: CandidateItem[] = [];

  // GitHub repos: CLI + OpenClaw + peers
  for (const fetch of fetched) {
    candidates.push(...extractRepoCandidates(fetch, PERSONAL_CONFIG, PERSONAL_CONFIG.detailLimit));
  }

  // Skills
  const skillsFetch: RepoFetch = {
    cfg: { id: "claude-code-skills", repo: CLAUDE_SKILLS_REPO, name: "Claude Code Skills" },
    issues: skillsData.issues,
    prs: skillsData.prs,
    releases: [],
  };
  candidates.push(...extractRepoCandidates(skillsFetch, PERSONAL_CONFIG, 3));

  // Data sources
  candidates.push(...extractWebCandidates(webResults, 8));
  candidates.push(...extractTrendingCandidates(trendingData, 5));
  candidates.push(...extractHnCandidates(hnData, 5));
  candidates.push(...extractPhCandidates(phData, 3));
  candidates.push(...extractArxivCandidates(arxivData, 5));
  candidates.push(...extractHfCandidates(hfData, 5));
  candidates.push(...extractCommunityCandidates(devtoData, lobstersData, 3));

  return candidates;
}

/** Build source success map for per-source state tracking. */
function buildSourceResults(
  fetched: RepoFetch[],
  webResults: WebFetchResult[],
  trendingData: TrendingData,
  hnData: HnData,
  phData: PhData,
  arxivData: ArxivData,
  hfData: HfData,
  devtoData: DevtoData,
  lobstersData: LobstersData,
): Record<string, { success: boolean; error?: string }> {
  const results: Record<string, { success: boolean; error?: string }> = {};

  // GitHub repos: success if we got any data (issues/prs/releases)
  for (const fetch of fetched) {
    const hasData = fetch.issues.length > 0 || fetch.prs.length > 0 || fetch.releases.length > 0;
    results[`github-${fetch.cfg.id}`] = { success: hasData };
  }

  // Web sources
  for (const wr of webResults) {
    results[`web-${wr.site}`] = { success: wr.newItems.length > 0 || wr.totalDiscovered > 0 };
  }

  // Other sources
  results["trending"] = { success: trendingData.trendingFetchSuccess };
  results["hn"] = { success: hnData.fetchSuccess };
  results["ph"] = { success: phData.fetchSuccess };
  results["arxiv"] = { success: arxivData.fetchSuccess };
  results["hf"] = { success: hfData.fetchSuccess };
  results["devto"] = { success: devtoData.fetchSuccess };
  results["lobsters"] = { success: lobstersData.fetchSuccess };

  return results;
}

// ---------------------------------------------------------------------------
// Phase 3: Generate highlights + opportunity card from report JSON
// ---------------------------------------------------------------------------

function generateHighlightsFromJson(
  report: PersonalReportJson,
): Record<string, string[]> {
  const highlights: Record<string, string[]> = {
    "ai-personal": (report.overview ?? []).map((o) => `${o.topic}：${o.summary}`),
  };
  return highlights;
}

function generateOpportunityFromJson(
  report: PersonalReportJson,
): { summary: string; signals: Array<{ title: string; description: string; report: string }> } {
  // Extract actionable items from topics
  const signals: Array<{ title: string; description: string; report: string }> = [];
  for (const topic of report.topics ?? []) {
    for (const item of topic.items ?? []) {
      if (item.action) {
        signals.push({
          title: item.title,
          description: item.action,
          report: `ai-personal`,
        });
      }
    }
  }
  const firstOverview = report.overview?.[0];
  return {
    summary: firstOverview ? `${firstOverview.topic}：${firstOverview.summary}` : "",
    signals: signals.slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<string> {
  requireEnv("GITHUB_TOKEN");

  const now = new Date();
  const dateStr = toCstDateStr(now);
  const digestRepo = process.env["DIGEST_REPO"] ?? "";

  const providerName = process.env["LLM_PROVIDER"] ?? "anthropic";
  console.log(`[${now.toISOString()}] Starting personal digest | provider: ${providerName}`);

  // 1. Load state and calculate collection window
  const prevState = loadReportState();
  const since = calculateSince(prevState);
  const prevTrending = prevState?.snapshotMarkers?.["trending"] as TrendingSnapshot | undefined;
  const prevHf = prevState?.snapshotMarkers?.["hf"] as HfSnapshot | undefined;

  console.log(`  Previous report: ${prevState?.lastReportDate ?? "none"}`);
  console.log(`  Collection window since: ${since}`);

  // Same-day re-run detection
  if (checkSameDay(prevState, dateStr) && process.env["DRY_RUN"] !== "true") {
    console.log(`  Report for ${dateStr} already exists — skipping.`);
    return "skipped-same-day";
  }

  // 2. Fetch all data
  const webState = loadWebState();
  const {
    fetched,
    skillsData,
    webResults,
    trendingData,
    hnData,
    phData,
    arxivData,
    hfData,
    devtoData,
    lobstersData,
  } = await fetchAllData(since, webState, prevTrending, prevHf);

  // 3. Extract candidates and build balanced pool
  console.log("  Extracting candidates...");
  const allCandidates = extractAllCandidates(
    fetched,
    skillsData,
    webResults,
    trendingData,
    hnData,
    phData,
    arxivData,
    hfData,
    devtoData,
    lobstersData,
  );
  console.log(`  Total raw candidates: ${allCandidates.length}`);

  // Build balanced pool — prevents GitHub from starving other sources
  const balancedPool = buildBalancedPool(allCandidates, PERSONAL_CONFIG);
  console.log(`  Balanced pool: ${balancedPool.length} candidates`);

  // 4. Deterministic merge (URL dedup)
  const merged = mergeCandidates(balancedPool);
  console.log(`  After merge/dedup: ${merged.length} candidates`);

  // 5. Generate personal report via two-stage LLM
  console.log("  Generating personal report...");
  const reportResult = await generatePersonalReport(
    merged,
    PERSONAL_CONFIG,
    prevState?.lastSuccessfulAt ?? since,
    now.toISOString(),
    dateStr,
    "zh",
  );

  if (!reportResult) {
    console.error("  Personal report generation failed — aborting without updating state.");
    process.exitCode = 1;
    return "failed";
  }

  // 6. Update report state with per-source tracking
  const sourceResults = buildSourceResults(
    fetched,
    webResults,
    trendingData,
    hnData,
    phData,
    arxivData,
    hfData,
    devtoData,
    lobstersData,
  );
  const newState = updateStateAfterSuccess(prevState, dateStr, now);
  newState.sources = updateSourceStates(prevState, sourceResults, now);
  // Persist snapshot markers — only update if fetch succeeded, preserve old on failure
  const newSnapshots: Record<string, unknown> = { ...prevState?.snapshotMarkers };
  if (trendingData.trendingFetchSuccess) {
    newSnapshots["trending"] = extractTrendingSnapshot(trendingData);
  }
  if (hfData.fetchSuccess) {
    newSnapshots["hf"] = extractHfSnapshot(hfData);
  }
  newState.snapshotMarkers = newSnapshots;
  saveReportState(newState);
  console.log(`  Updated report state: lastSuccessfulAt=${newState.lastSuccessfulAt}`);

  // 7. Save web state
  saveWebState(webState);

  // 8. Generate highlights + opportunity card from JSON (backward compat)
  const highlights = generateHighlightsFromJson(reportResult.json);
  const highlightsPath = saveFile(JSON.stringify(highlights, null, 2), dateStr, "highlights.json");
  console.log(`  Saved ${highlightsPath}`);

  const oppCard = generateOpportunityFromJson(reportResult.json);
  const oppPath = saveFile(JSON.stringify(oppCard, null, 2), dateStr, "opportunity-card.json");
  console.log(`  Saved ${oppPath}`);

  // 9. Create GitHub Issue (optional)
  if (digestRepo) {
    const issueTitle = `AI 前沿个人简报 ${dateStr}`;
    const issueUrl = await createGitHubIssue(issueTitle, reportResult.markdown, "digest");
    console.log(`  Created issue: ${issueUrl}`);
  }

  const isNoUpdate = reportResult.json.topics.length === 0;
  console.log("Done!");
  return isNoUpdate ? "no-important-updates" : "generated";
}

main()
  .then((status) => {
    console.log(`[status] ${status}`);
    if (status === "failed") {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
