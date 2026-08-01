/**
 * Telegram notification — reads manifest.json and sends a message
 * with links to the latest reports.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NOTIFY_LABELS } from "./i18n.ts";
import { PAGES_URL as SITE_PAGES_URL } from "./site.ts";
import type { ReportHighlights } from "./prompts-data.ts";
import {
  makeNotificationKey,
  createProductionStore,
  type NotificationStateStore,
} from "./notification-state.ts";

export interface Highlights {
  zh: ReportHighlights;
  en: ReportHighlights;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function redactSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[REDACTED]");
}

export function buildMessage(
  date: string,
  reports: string[],
  pagesUrl?: string,
  highlights?: Highlights | null,
): string {
  const PAGES_URL = (pagesUrl ?? SITE_PAGES_URL).replace(/\/$/, "");
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isWeekly = baseReports.includes("ai-weekly");
  const isMonthly = baseReports.includes("ai-monthly");

  const icon = isMonthly ? "📆" : isWeekly ? "📅" : "📡";
  const suffix = isMonthly ? " 月报" : isWeekly ? " 周报" : "";
  const lines: string[] = [`${icon} <b>agents-radar${suffix} · ${date}</b>`];

  const ordered = [
    ...baseReports.filter((r) => !r.includes("weekly") && !r.includes("monthly")),
    ...baseReports.filter((r) => r.includes("weekly") || r.includes("monthly")),
  ];

  const zhHighlights = highlights?.zh ?? {};

  for (const r of ordered) {
    const zhLabel = NOTIFY_LABELS[r]?.zh ?? r;
    const zhUrl = `${PAGES_URL}/#${date}/${r}`;
    const enKey = `${r}-en`;

    lines.push("");
    if (reports.includes(enKey)) {
      const enLabel = NOTIFY_LABELS[r]?.en ?? "EN";
      const enUrl = `${PAGES_URL}/#${date}/${enKey}`;
      lines.push(`• <a href="${zhUrl}">${zhLabel}</a>  ·  <a href="${enUrl}">${enLabel}</a>`);
    } else {
      lines.push(`• <a href="${zhUrl}">${zhLabel}</a>`);
    }

    const items = zhHighlights[r];
    if (items?.length) {
      for (const h of items) {
        lines.push(`  ◦ ${escapeHtml(h)}`);
      }
    }
  }

  lines.push(`\n<a href="${PAGES_URL}">🌐 Web UI</a>  ·  <a href="${PAGES_URL}/feed.xml">⊕ RSS</a>`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Testable orchestration
// ---------------------------------------------------------------------------

export interface TelegramSendResult {
  success: boolean;
  skipped: boolean;
  error?: string;
}

export interface TelegramSendDeps {
  env: Record<string, string>;
  fetchManifest: () => Promise<{ dates: Array<{ date: string; reports: string[] }> }>;
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  stateStore: NotificationStateStore;
  forceSend?: boolean;
  loadHighlights?: (date: string) => Highlights | null;
}

export async function executeTelegramSend(deps: TelegramSendDeps): Promise<TelegramSendResult> {
  const { env, fetchManifest, fetchFn, stateStore, loadHighlights } = deps;
  const forceSend = deps.forceSend ?? env["FORCE_SEND"] === "true";

  const botToken = env["TELEGRAM_BOT_TOKEN"] ?? "";
  if (!botToken) {
    return { success: true, skipped: true };
  }

  const chatId = env["TELEGRAM_CHAT_ID"] || "@agents_radar";
  const reportDate = env["REPORT_DATE"] ?? "";

  if (!reportDate) {
    return { success: false, skipped: false, error: "REPORT_DATE not set" };
  }

  let dates: Array<{ date: string; reports: string[] }>;
  try {
    const manifest = await fetchManifest();
    dates = manifest.dates;
  } catch (e) {
    return {
      success: false,
      skipped: false,
      error: `manifest read failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!dates || dates.length === 0) {
    return { success: false, skipped: false, error: "manifest is empty" };
  }

  // Latest date must exactly match REPORT_DATE
  if (dates[0]!.date !== reportDate) {
    return {
      success: false,
      skipped: false,
      error: `manifest latest date (${dates[0]!.date}) != REPORT_DATE (${reportDate})`,
    };
  }

  const { date, reports } = dates[0]!;

  // Dedup
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isMonthly = baseReports.includes("ai-monthly");
  const isWeekly = baseReports.includes("ai-weekly");
  const type = isMonthly ? "monthly" : isWeekly ? "weekly" : "daily";
  const notifKey = makeNotificationKey("telegram", type, date, chatId);

  if (stateStore.isAlreadySent(notifKey) && !forceSend) {
    return { success: true, skipped: true };
  }

  // Build message
  const highlights = loadHighlights ? loadHighlights(date) : null;
  const text = buildMessage(date, reports, undefined, highlights);

  // Send
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        success: false,
        skipped: false,
        error: redactSecret(`Telegram API ${res.status}: ${body}`, botToken),
      };
    }
    // Validate JSON response: Telegram returns { ok: true } on success
    try {
      const json = (await res.json()) as { ok?: boolean; description?: string };
      if (json.ok !== true) {
        return {
          success: false,
          skipped: false,
          error: redactSecret(`Telegram API error: ${json.description ?? "ok !== true"}`, botToken),
        };
      }
    } catch {
      return { success: false, skipped: false, error: "Telegram API: invalid JSON response" };
    }
  } catch (e) {
    return {
      success: false,
      skipped: false,
      error: redactSecret(e instanceof Error ? e.message : String(e), botToken),
    };
  }

  stateStore.recordSend(notifKey);
  return { success: true, skipped: false };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const result = await executeTelegramSend({
    env: process.env as Record<string, string>,
    fetchManifest: async () => {
      if (!fs.existsSync("manifest.json")) throw new Error("manifest.json not found");
      return JSON.parse(fs.readFileSync("manifest.json", "utf-8"));
    },
    fetchFn: globalThis.fetch as (url: string, init?: RequestInit) => Promise<Response>,
    stateStore: createProductionStore(),
    forceSend: process.env["FORCE_SEND"] === "true",
    loadHighlights: (date: string) => {
      const highlightsPath = path.join("digests", date, "highlights.json");
      if (!fs.existsSync(highlightsPath)) return null;
      try {
        const raw = JSON.parse(fs.readFileSync(highlightsPath, "utf-8")) as Record<string, unknown>;
        if (raw?.zh || raw?.en) return raw as unknown as Highlights;
        return { zh: raw as Record<string, string[]>, en: {} };
      } catch {
        return null;
      }
    },
  });

  if (!result.success) {
    console.error(`[notify] ${result.error}`);
    process.exit(1);
  }
  if (result.skipped) {
    console.log("[notify] Skipped (no token or already sent).");
  } else {
    console.log("[notify] Done!");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error("[notify]", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
