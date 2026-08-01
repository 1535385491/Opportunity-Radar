/**
 * Shared notification dedup state.
 *
 * Provides a single source of truth for "has this notification been sent?"
 * across Telegram and Feishu channels.
 *
 * Key format: channel:reportType:date:destinationHash
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const STATE_FILE = path.join("digests", "notification-state.json");

export interface NotificationState {
  sent: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Store interface — injected into orchestration functions
// ---------------------------------------------------------------------------

export interface NotificationStateStore {
  isAlreadySent(key: string): boolean;
  recordSend(key: string): void;
}

/** Production store: reads/writes digests/notification-state.json */
export function createProductionStore(): NotificationStateStore {
  return {
    isAlreadySent(key: string): boolean {
      try {
        if (!fs.existsSync(STATE_FILE)) return false;
        const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as NotificationState;
        return !!state.sent[key];
      } catch {
        return false;
      }
    },
    recordSend(key: string): void {
      let state: NotificationState = { sent: {} };
      try {
        if (fs.existsSync(STATE_FILE)) {
          state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as NotificationState;
        }
      } catch {
        // corrupt file, start fresh
      }
      state.sent[key] = new Date().toISOString();
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
    },
  };
}

/** In-memory store for testing — no file I/O */
export function createMemoryStore(initial?: Record<string, string>): NotificationStateStore {
  const sent = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    isAlreadySent(key: string): boolean {
      return sent.has(key);
    },
    recordSend(key: string): void {
      sent.set(key, new Date().toISOString());
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy direct-access helpers (used only by CLI main wrappers)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Key/hash utilities (pure, no I/O)
// ---------------------------------------------------------------------------

export function hashDestination(destination: string): string {
  return crypto.createHash("sha256").update(destination).digest("hex").slice(0, 12);
}

export function makeNotificationKey(
  channel: string,
  reportType: string,
  date: string,
  destination: string,
): string {
  return `${channel}:${reportType}:${date}:${hashDestination(destination)}`;
}

export function makeFeishuIdempotencyKey(reportType: string, date: string, destination: string): string {
  const hash = hashDestination(destination);
  return `notif-${reportType}-${date}-${hash}`.slice(0, 50);
}
