/**
 * Shared notification dedup state.
 *
 * Provides a single source of truth for "has this notification been sent?"
 * across Telegram and Feishu channels.
 *
 * Key format: channel:reportType:date:destinationHash
 * - channel: "telegram" | "feishu-openapi" | "feishu-webhook"
 * - reportType: "daily" | "weekly" | "monthly"
 * - date: "YYYY-MM-DD"
 * - destinationHash: 12-char SHA-256 prefix (irreversible)
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STATE_FILE = path.join("digests", "notification-state.json");

export interface NotificationState {
  sent: Record<string, string>; // key → ISO timestamp of last successful send
}

export function loadNotificationState(): NotificationState {
  try {
    if (!fs.existsSync(STATE_FILE)) return { sent: {} };
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as NotificationState;
  } catch {
    return { sent: {} };
  }
}

export function saveNotificationState(state: NotificationState): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Hash a destination identifier (chat ID, webhook URL) to a short irreversible prefix.
 * Never stores the raw secret in the state file or logs.
 */
export function hashDestination(destination: string): string {
  return crypto.createHash("sha256").update(destination).digest("hex").slice(0, 12);
}

/**
 * Build the dedup key for a notification.
 */
export function makeNotificationKey(
  channel: string,
  reportType: string,
  date: string,
  destination: string,
): string {
  return `${channel}:${reportType}:${date}:${hashDestination(destination)}`;
}

/**
 * Check if this notification has already been sent.
 */
export function isAlreadySent(key: string): boolean {
  const state = loadNotificationState();
  return !!state.sent[key];
}

/**
 * Record a successful send.
 */
export function recordSend(key: string): void {
  const state = loadNotificationState();
  state.sent[key] = new Date().toISOString();
  saveNotificationState(state);
}

/**
 * Generate a deterministic UUID for Feishu Open API idempotency.
 * Format: notif-<channel>-<date>-<hash> (≤50 chars).
 */
export function makeFeishuIdempotencyKey(reportType: string, date: string, destination: string): string {
  const hash = hashDestination(destination);
  return `notif-${reportType}-${date}-${hash}`.slice(0, 50);
}
