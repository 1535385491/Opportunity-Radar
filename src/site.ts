/**
 * Centralized site-wide constants.
 *
 * All modules that need the public Pages URL should import from here
 * instead of hard-coding or reading process.env independently.
 */

/** Canonical public site URL — used in notifications, RSS, and manifest. */
export const PAGES_URL: string = (
  process.env["PAGES_URL"] ?? "https://1535385491.github.io/Opportunity-Radar"
).replace(/\/$/, "");
