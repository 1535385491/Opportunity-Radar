/**
 * Manages report generation state: last successful run time,
 * snapshot markers for trending/HF sources, and collection window calculation.
 *
 * State is persisted to digests/report-state.json.
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceState {
  lastSuccessfulAt: string | null;
  lastError?: string;
}

export interface ReportState {
  /** ISO-8601 timestamp of the last successful report generation. */
  lastSuccessfulAt: string;
  /** Date string (YYYY-MM-DD) of the last generated report. */
  lastReportDate: string;
  /** Per-source snapshot markers for dedup of trending/snapshot sources. */
  snapshotMarkers: Record<string, unknown>;
  /** Per-source collection cursors. Keyed by source ID (e.g. "github-codex"). */
  sources?: Record<string, SourceState>;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const STATE_FILE = path.resolve("digests", "report-state.json");

const DEFAULT_FALLBACK_DAYS = 4;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadReportState(): ReportState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as ReportState;
    if (!raw.lastSuccessfulAt || !raw.lastReportDate) return null;
    // Validate ISO date string
    if (isNaN(Date.parse(raw.lastSuccessfulAt))) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveReportState(state: ReportState): void {
  const dir = path.dirname(STATE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Window calculation
// ---------------------------------------------------------------------------

/**
 * Calculates the "since" timestamp for data collection.
 *
 * - If a valid state exists, returns `lastSuccessfulAt`.
 * - Otherwise falls back to `DEFAULT_FALLBACK_DAYS` days ago.
 */
export function calculateSince(state: ReportState | null): string {
  if (state?.lastSuccessfulAt) {
    return state.lastSuccessfulAt;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - DEFAULT_FALLBACK_DAYS);
  return fallback.toISOString();
}

/**
 * Creates an updated state after a successful report generation.
 *
 * Handles the Monday-override-weekend rule: if today is Monday (CST)
 * and the last report was from Friday, the window extends back to Friday
 * so weekend content is included.
 */
export function updateStateAfterSuccess(
  prev: ReportState | null,
  reportDateCst: string,
  now: Date = new Date(),
): ReportState {
  return {
    lastSuccessfulAt: now.toISOString(),
    lastReportDate: reportDateCst,
    snapshotMarkers: prev?.snapshotMarkers ?? {},
  };
}

/**
 * Exports the fallback days constant for testing.
 */
export function getFallbackDays(): number {
  return DEFAULT_FALLBACK_DAYS;
}

// ---------------------------------------------------------------------------
// Per-source state tracking
// ---------------------------------------------------------------------------

/**
 * Calculates the "since" timestamp for a specific source.
 * Falls back to the global `lastSuccessfulAt` if no per-source state exists.
 */
export function calculateSourceSince(
  state: ReportState | null,
  sourceId: string,
): string {
  const sourceState = state?.sources?.[sourceId];
  if (sourceState?.lastSuccessfulAt) {
    return sourceState.lastSuccessfulAt;
  }
  return calculateSince(state);
}

/**
 * Updates per-source state after a successful run.
 * Only advances cursors for sources that succeeded.
 */
export function updateSourceStates(
  prev: ReportState | null,
  sourceResults: Record<string, { success: boolean; error?: string }>,
  now: Date = new Date(),
): Record<string, SourceState> {
  const prevSources = prev?.sources ?? {};
  const result: Record<string, SourceState> = {};

  for (const [sourceId, sourceResult] of Object.entries(sourceResults)) {
    if (sourceResult.success) {
      result[sourceId] = {
        lastSuccessfulAt: now.toISOString(),
      };
    } else {
      // Preserve existing cursor, record error
      result[sourceId] = {
        lastSuccessfulAt: prevSources[sourceId]?.lastSuccessfulAt ?? null,
        lastError: sourceResult.error ?? "unknown error",
      };
    }
  }

  // Preserve any sources not in this run
  for (const [sourceId, sourceState] of Object.entries(prevSources)) {
    if (!(sourceId in result)) {
      result[sourceId] = sourceState;
    }
  }

  return result;
}

/**
 * Checks if a report has already been generated for the given date.
 * Used for same-day re-run detection.
 */
export function checkSameDay(state: ReportState | null, dateStr: string): boolean {
  return state?.lastReportDate === dateStr;
}
