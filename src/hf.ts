/**
 * Hugging Face trending models fetched via the HF Hub API.
 *
 * Strategy: fetch trending models sorted by weekly likes from the
 * HF Hub API, returning a mapped subset of fields.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HfModel {
  id: string; // e.g. "meta-llama/Llama-3.1-8B"
  author: string;
  likes: number;
  downloads: number;
  tags: string[];
  pipelineTag: string;
  lastModified: string;
  url: string;
}

export interface HfData {
  models: HfModel[];
  fetchSuccess: boolean;
  /** Snapshot markers for dedup in subsequent runs. */
  snapshotMarkers: HfSnapshot;
}

/** Stored in report-state.json to detect new/changed HF models. */
export interface HfSnapshot {
  /** Set of model IDs that appeared in the trending list. */
  modelIds: string[];
  /** modelId → likes from the previous snapshot. */
  likeCounts: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HF_FETCH_LIMIT = 30;
const API_URL = "https://huggingface.co/api/models";

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

interface HfApiModel {
  _id: string;
  id: string;
  author?: string;
  likes: number;
  downloads: number;
  tags?: string[];
  pipeline_tag?: string;
  lastModified?: string;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchHfData(previousSnapshot?: HfSnapshot): Promise<HfData> {
  try {
    // Fetch trending models (sorted by likes, recently modified)
    const params = new URLSearchParams({
      sort: "likes7d",
      direction: "-1",
      limit: String(HF_FETCH_LIMIT),
      full: "false",
    });

    const resp = await fetch(`${API_URL}?${params}`, {
      headers: { "User-Agent": "agents-radar/1.0" },
    });

    if (!resp.ok) {
      console.error(`  [hf] HTTP ${resp.status}`);
      return { models: [], fetchSuccess: false, snapshotMarkers: { modelIds: [], likeCounts: {} } };
    }

    const raw = (await resp.json()) as HfApiModel[];

    const models: HfModel[] = raw.map((m) => ({
      id: m.id,
      author: m.author ?? m.id.split("/")[0] ?? "unknown",
      likes: m.likes,
      downloads: m.downloads,
      tags: m.tags ?? [],
      pipelineTag: m.pipeline_tag ?? "",
      lastModified: m.lastModified ?? "",
      url: `https://huggingface.co/${m.id}`,
    }));

    // Build new snapshot markers
    const newSnapshot: HfSnapshot = {
      modelIds: models.map((m) => m.id),
      likeCounts: Object.fromEntries(models.map((m) => [m.id, m.likes])),
    };

    // Filter: only new entrants or significant like growth
    const prevIds = previousSnapshot ? new Set(previousSnapshot.modelIds) : null;
    const prevLikes = previousSnapshot?.likeCounts ?? {};

    const filteredModels = prevIds
      ? models.filter((m) => {
          if (!prevIds.has(m.id)) return true; // new entrant
          const prev = prevLikes[m.id] ?? 0;
          const growth = m.likes - prev;
          return growth > 100 || (prev > 0 && growth / prev > 0.3); // significant growth
        })
      : models;

    console.log(`  [hf] ${filteredModels.length} trending models (from ${models.length} total)`);
    return { models: filteredModels, fetchSuccess: filteredModels.length > 0, snapshotMarkers: newSnapshot };
  } catch (err) {
    console.error(`  [hf] fetch failed: ${err}`);
    return { models: [], fetchSuccess: false, snapshotMarkers: { modelIds: [], likeCounts: {} } };
  }
}
