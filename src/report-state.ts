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

export interface ReportState {
  /** ISO-8601 timestamp of the last successful report generation. */
  lastSuccessfulAt: string;
  /** Date string (YYYY-MM-DD) of the last generated report. */
  lastReportDate: string;
  /** Per-source snapshot markers for dedup of trending/snapshot sources. */
  snapshotMarkers: Record<string, unknown>;
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
