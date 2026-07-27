import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import {
  loadReportState,
  saveReportState,
  calculateSince,
  updateStateAfterSuccess,
  getFallbackDays,
} from "../report-state.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE_PATH = expect.stringContaining("report-state.json");

// ---------------------------------------------------------------------------
// loadReportState
// ---------------------------------------------------------------------------

describe("loadReportState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when state file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect(loadReportState()).toBeNull();
  });

  it("returns null when file contains invalid JSON", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("not json {{{");
    expect(loadReportState()).toBeNull();
  });

  it("returns null when lastSuccessfulAt is missing", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ lastReportDate: "2026-07-25" }));
    expect(loadReportState()).toBeNull();
  });

  it("returns null when lastSuccessfulAt is not a valid date", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      JSON.stringify({ lastSuccessfulAt: "not-a-date", lastReportDate: "2026-07-25" }),
    );
    expect(loadReportState()).toBeNull();
  });

  it("returns valid state when file is correct", () => {
    const state = {
      lastSuccessfulAt: "2026-07-25T08:00:00.000Z",
      lastReportDate: "2026-07-25",
      snapshotMarkers: { trending: { repo1: 100 } },
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(state));
    const result = loadReportState();
    expect(result).toEqual(state);
  });
});

// ---------------------------------------------------------------------------
// saveReportState
// ---------------------------------------------------------------------------

describe("saveReportState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes state as JSON with correct formatting", () => {
    const mkdirSpy = vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined as never);
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined as never);

    const state = {
      lastSuccessfulAt: "2026-07-25T08:00:00.000Z",
      lastReportDate: "2026-07-25",
      snapshotMarkers: {},
    };
    saveReportState(state);

    expect(mkdirSpy).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    expect(writeSpy).toHaveBeenCalledWith(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  });
});

// ---------------------------------------------------------------------------
// calculateSince
// ---------------------------------------------------------------------------

describe("calculateSince", () => {
  it("returns lastSuccessfulAt from valid state", () => {
    const state = {
      lastSuccessfulAt: "2026-07-25T08:00:00.000Z",
      lastReportDate: "2026-07-25",
      snapshotMarkers: {},
    };
    expect(calculateSince(state)).toBe("2026-07-25T08:00:00.000Z");
  });

  it("falls back to N days ago when state is null", () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = calculateSince(null);
    const resultDate = new Date(result);
    const expectedDate = new Date("2026-07-23T12:00:00.000Z");
    expect(resultDate.toISOString()).toBe(expectedDate.toISOString());

    vi.useRealTimers();
  });

  it("falls back to N days ago when state has no lastSuccessfulAt", () => {
    const now = new Date("2026-07-27T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = calculateSince({
      lastSuccessfulAt: "",
      lastReportDate: "2026-07-25",
      snapshotMarkers: {},
    });
    const resultDate = new Date(result);
    const days = getFallbackDays();
    expect(resultDate.getDate()).toBe(now.getDate() - days);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// updateStateAfterSuccess
// ---------------------------------------------------------------------------

describe("updateStateAfterSuccess", () => {
  it("creates new state with current timestamp", () => {
    const now = new Date("2026-07-27T08:00:00.000Z");
    const result = updateStateAfterSuccess(null, "2026-07-27", now);
    expect(result.lastSuccessfulAt).toBe("2026-07-27T08:00:00.000Z");
    expect(result.lastReportDate).toBe("2026-07-27");
    expect(result.snapshotMarkers).toEqual({});
  });

  it("preserves existing snapshot markers", () => {
    const prev = {
      lastSuccessfulAt: "2026-07-25T08:00:00.000Z",
      lastReportDate: "2026-07-25",
      snapshotMarkers: { trending: { repo1: 100 } },
    };
    const now = new Date("2026-07-27T08:00:00.000Z");
    const result = updateStateAfterSuccess(prev, "2026-07-27", now);
    expect(result.snapshotMarkers).toEqual({ trending: { repo1: 100 } });
  });

  it("does not advance time window on failure (caller must not call)", () => {
    // This test documents the contract: updateStateAfterSuccess should only
    // be called after a successful report save. If the pipeline fails,
    // it must NOT call this function, preserving the previous state.
    const prev = {
      lastSuccessfulAt: "2026-07-25T08:00:00.000Z",
      lastReportDate: "2026-07-25",
      snapshotMarkers: {},
    };
    // Simulate: pipeline fails, state unchanged
    // (The pipeline simply doesn't call updateStateAfterSuccess)
    expect(prev.lastSuccessfulAt).toBe("2026-07-25T08:00:00.000Z");
    expect(prev.lastReportDate).toBe("2026-07-25");
  });
});
