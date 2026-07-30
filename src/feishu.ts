/**
 * Feishu (Lark) notification — sends rich card messages to a Feishu group.
 *
 * Supports two modes:
 *   1. Feishu Open API (recommended): uses app credentials to send messages
 *      Required env vars: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CHAT_ID
 *   2. Webhook (legacy): sends to custom bot webhook URLs
 *      Required env var: FEISHU_WEBHOOK_URLS (comma-separated)
 *
 * Open API mode takes priority when FEISHU_APP_ID is set.
 *
 * Optional:
 *   PAGES_URL — GitHub Pages base URL (defaults to the public deployment)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { NOTIFY_LABELS } from "./i18n.ts";
import { PAGES_URL as SITE_PAGES_URL } from "./site.ts";
import { guardReportSchema } from "./personal-report.ts";
import type { PersonalReportJson } from "./personal-report.ts";
import {
  makeNotificationKey,
  makeFeishuIdempotencyKey,
  createProductionStore,
  type NotificationStateStore,
} from "./notification-state.ts";

// ---------------------------------------------------------------------------
// Feishu Open API — app-based authentication
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Webhook mode (legacy) — per-webhook dedup
// ---------------------------------------------------------------------------

export function getWebhookUrls(): string[] {
  const raw = process.env["FEISHU_WEBHOOK_URLS"] ?? process.env["FEISHU_WEBHOOK_URL"] ?? "";
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Card builder — narrative + opportunity signals, mobile-friendly
// ---------------------------------------------------------------------------

function escapeMarkdown(s: string): string {
  return s.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

interface CardContext {
  date: string;
  reports: string[];
  pagesUrl: string;
  personalDigest: PersonalReportJson | null;
  type: "daily" | "weekly" | "monthly";
}

export function buildCard(ctx: CardContext): unknown {
  const { date, reports, pagesUrl, personalDigest, type } = ctx;
  const baseReports = reports.filter((r) => !r.endsWith("-en"));

  const icon = type === "monthly" ? "📆" : type === "weekly" ? "📅" : "📡";
  const suffix = type === "monthly" ? " 月报" : type === "weekly" ? " 周报" : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = [];

  // --- Five-minute brief from personal-digest.json ---
  if (personalDigest?.fiveMinuteBrief?.topicGroups?.length) {
    const eventMap = new Map<string, { title: string; quick: { what: string; why: string } }>();
    for (const evt of personalDigest.events ?? []) {
      eventMap.set(evt.id, { title: evt.title, quick: evt.quick });
    }
    const overviewLines: string[] = [];
    let idx = 0;
    for (const group of personalDigest.fiveMinuteBrief.topicGroups) {
      for (const id of group.eventIds ?? []) {
        const evt = eventMap.get(id);
        if (!evt) continue;
        idx++;
        overviewLines.push(
          `${idx}. **${escapeMarkdown(evt.title)}**\n   ${escapeMarkdown(evt.quick.what)} → ${escapeMarkdown(evt.quick.why)}`,
        );
      }
    }
    if (overviewLines.length) {
      elements.push({
        tag: "markdown",
        content: `**📋 五分钟概览**\n\n${overviewLines.join("\n")}`,
      });
    }
  }

  // --- Tool status from personal-digest.json ---
  if (personalDigest?.toolStatus && Object.keys(personalDigest.toolStatus).length > 0) {
    const statusLines = Object.entries(personalDigest.toolStatus).map(
      ([tool, status]) => `• **${escapeMarkdown(tool)}**：${escapeMarkdown(status)}`,
    );
    elements.push({ tag: "hr" });
    elements.push({
      tag: "markdown",
      content: `**🔧 主力工具状态**\n\n${statusLines.join("\n")}`,
    });
  }

  // --- Single report entry link ---
  elements.push({ tag: "hr" });

  const linkLines: string[] = [];
  for (const r of baseReports) {
    const zhLabel = NOTIFY_LABELS[r]?.zh ?? r;
    const zhUrl = `${pagesUrl}/#${date}/${r}`;
    const enKey = `${r}-en`;
    if (reports.includes(enKey)) {
      const enLabel = NOTIFY_LABELS[r]?.en ?? "EN";
      const enUrl = `${pagesUrl}/#${date}/${enKey}`;
      linkLines.push(`• [${zhLabel}](${zhUrl}) · [${enLabel}](${enUrl})`);
    } else {
      linkLines.push(`• [${zhLabel}](${zhUrl})`);
    }
  }

  elements.push({
    tag: "markdown",
    content: "**📎 查看完整报告**\n\n" + linkLines.join("\n"),
  });

  elements.push({ tag: "hr" });
  elements.push({
    tag: "markdown",
    content: `[🌐 Web UI](${pagesUrl})  ·  [⊕ RSS](${pagesUrl}/feed.xml)`,
  });

  return {
    header: {
      title: { tag: "plain_text", content: `${icon} agents-radar${suffix} · ${date}` },
      template: "blue",
    },
    elements,
  };
}

/**
 * Generates feishu-card.json and feishu-preview.md from a PersonalReportJson.
 */
export function generateFeishuArtifacts(
  date: string,
  reports: string[],
  personalDigest: PersonalReportJson,
  pagesUrl?: string,
): { cardJson: string; previewMd: string } {
  const PAGES_URL = (pagesUrl ?? SITE_PAGES_URL).replace(/\/$/, "");
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isMonthly = baseReports.includes("ai-monthly");
  const isWeekly = baseReports.includes("ai-weekly");
  const type = isMonthly ? "monthly" : isWeekly ? "weekly" : "daily";

  const card = buildCard({ date, reports, pagesUrl: PAGES_URL, personalDigest, type });
  const cardJson = JSON.stringify(card, null, 2);

  const lines: string[] = [`# 飞书卡片预览 — ${date}`, "", "以下内容将发送到飞书群：", ""];
  if (personalDigest.fiveMinuteBrief?.topicGroups?.length) {
    const eventMap = new Map<string, { title: string; quick: { what: string; why: string } }>();
    for (const evt of personalDigest.events ?? []) {
      eventMap.set(evt.id, { title: evt.title, quick: evt.quick });
    }
    lines.push("**📋 五分钟概览**");
    let idx = 0;
    for (const group of personalDigest.fiveMinuteBrief.topicGroups) {
      for (const id of group.eventIds ?? []) {
        const evt = eventMap.get(id);
        if (!evt) continue;
        idx++;
        lines.push(`${idx}. **${evt.title}**`);
        lines.push(`   ${evt.quick.what} → ${evt.quick.why}`);
      }
    }
    lines.push("");
  } else {
    lines.push("（无概览内容）", "");
  }
  if (personalDigest.toolStatus && Object.keys(personalDigest.toolStatus).length > 0) {
    lines.push("**🔧 主力工具状态**");
    for (const [tool, status] of Object.entries(personalDigest.toolStatus)) {
      lines.push(`• **${tool}**：${status}`);
    }
    lines.push("");
  }
  lines.push("**📎 查看完整报告**");
  for (const r of baseReports) {
    lines.push(`• ${PAGES_URL}/#${date}/${r}`);
  }

  return { cardJson, previewMd: lines.join("\n") };
}

export function buildFeishuMessage(
  date: string,
  reports: string[],
  pagesUrl?: string,
  personalDigest?: PersonalReportJson | null,
): string {
  const PAGES_URL = (pagesUrl ?? SITE_PAGES_URL).replace(/\/$/, "");
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isWeekly = baseReports.includes("ai-weekly");
  const isMonthly = baseReports.includes("ai-monthly");

  const icon = isMonthly ? "📆" : isWeekly ? "📅" : "📡";
  const suffix = isMonthly ? " 月报" : isWeekly ? " 周报" : "";
  const lines: string[] = [`${icon} **agents-radar${suffix} · ${date}**`];

  // Five-minute brief from personal-digest
  if (personalDigest?.fiveMinuteBrief?.topicGroups?.length) {
    const eventMap = new Map<string, { title: string; quick: { what: string; why: string } }>();
    for (const evt of personalDigest.events ?? []) {
      eventMap.set(evt.id, { title: evt.title, quick: evt.quick });
    }
    lines.push("");
    lines.push("**📋 五分钟概览**");
    let idx = 0;
    for (const group of personalDigest.fiveMinuteBrief.topicGroups) {
      for (const id of group.eventIds ?? []) {
        const evt = eventMap.get(id);
        if (!evt) continue;
        idx++;
        lines.push(`${idx}. **${evt.title}**`);
        lines.push(`   ${evt.quick.what} → ${evt.quick.why}`);
      }
    }
  }

  // Tool status from personal-digest
  if (personalDigest?.toolStatus && Object.keys(personalDigest.toolStatus).length > 0) {
    lines.push("");
    lines.push("**🔧 主力工具状态**");
    for (const [tool, status] of Object.entries(personalDigest.toolStatus)) {
      lines.push(`• **${tool}**：${status}`);
    }
  }

  // Report links
  const ordered = [
    ...baseReports.filter((r) => !r.includes("weekly") && !r.includes("monthly")),
    ...baseReports.filter((r) => r.includes("weekly") || r.includes("monthly")),
  ];

  for (const r of ordered) {
    const zhLabel = NOTIFY_LABELS[r]?.zh ?? r;
    const zhUrl = `${PAGES_URL}/#${date}/${r}`;
    const enKey = `${r}-en`;

    lines.push("");
    if (reports.includes(enKey)) {
      const enLabel = NOTIFY_LABELS[r]?.en ?? "EN";
      const enUrl = `${PAGES_URL}/#${date}/${enKey}`;
      lines.push(`• [${zhLabel}](${zhUrl})  ·  [${enLabel}](${enUrl})`);
    } else {
      lines.push(`• [${zhLabel}](${zhUrl})`);
    }
  }

  lines.push(`\n[🌐 Web UI](${PAGES_URL})  ·  [⊕ RSS](${PAGES_URL}/feed.xml)`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pre-send publication check with bounded retry
// ---------------------------------------------------------------------------

export async function checkReportPublished(
  pagesUrl: string,
  date: string,
  expectedGeneratedAt: string,
  maxRetries = 6,
  intervalMs = 10_000,
): Promise<string | null> {
  if (!expectedGeneratedAt || !expectedGeneratedAt.trim()) {
    return "expectedGeneratedAt 为空，拒绝发送";
  }

  const base = pagesUrl.replace(/\/$/, "");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const bust = Date.now();

    // 1. Check manifest
    try {
      const res = await fetch(`${base}/manifest.json?_=${bust}`);
      if (!res.ok) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `manifest.json 请求失败 (${res.status})`;
      }
      const { dates } = (await res.json()) as { dates: Array<{ date: string; reports: string[] }> };
      const entry = dates?.find((d) => d.date === date);
      if (!entry) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `线上 manifest 不包含 ${date}（重试 ${maxRetries} 次后）`;
      }
      if (!entry.reports.includes("ai-personal")) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `${date} 的线上 manifest 不包含 ai-personal（重试 ${maxRetries} 次后）`;
      }
    } catch (e) {
      if (attempt < maxRetries) {
        await delay(intervalMs);
        continue;
      }
      return `manifest.json 请求异常: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 2. Check ai-personal.md returns 200
    try {
      const res = await fetch(`${base}/digests/${date}/ai-personal.md?_=${bust}`);
      if (!res.ok) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `ai-personal.md 请求失败 (${res.status})（重试 ${maxRetries} 次后）`;
      }
    } catch (e) {
      if (attempt < maxRetries) {
        await delay(intervalMs);
        continue;
      }
      return `ai-personal.md 请求异常: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 3. Check personal-digest.json generatedAt matches
    try {
      const res = await fetch(`${base}/digests/${date}/personal-digest.json?_=${bust}`);
      if (!res.ok) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `personal-digest.json 请求失败 (${res.status})（重试 ${maxRetries} 次后）`;
      }
      const remoteJson = (await res.json()) as { generatedAt?: string };
      if (!remoteJson.generatedAt) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `远端 personal-digest.json 缺少 generatedAt（重试 ${maxRetries} 次后）`;
      }
      if (remoteJson.generatedAt !== expectedGeneratedAt) {
        if (attempt < maxRetries) {
          await delay(intervalMs);
          continue;
        }
        return `远端 generatedAt 不一致：期望 ${expectedGeneratedAt}，实际 ${remoteJson.generatedAt}（重试 ${maxRetries} 次后）`;
      }
    } catch (e) {
      if (attempt < maxRetries) {
        await delay(intervalMs);
        continue;
      }
      return `personal-digest.json 请求异常: ${e instanceof Error ? e.message : String(e)}`;
    }

    return null; // success
  }

  return `发布检查超时（重试 ${maxRetries} 次）`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Manifest validation — pure, no side effects
// ---------------------------------------------------------------------------

export interface ManifestEntry {
  date: string;
  reports: string[];
}

export interface ManifestValidationResult {
  ok: boolean;
  entry?: ManifestEntry;
  error?: string;
}

export function validateManifestEntry(
  dates: ManifestEntry[] | null | undefined,
  reportDate: string,
): ManifestValidationResult {
  if (!dates || !Array.isArray(dates) || dates.length === 0) {
    return { ok: false, error: "manifest is empty or invalid" };
  }
  const entry = dates.find((d) => d.date === reportDate);
  if (!entry) {
    return { ok: false, error: `${reportDate} not in manifest` };
  }
  if (!entry.reports || !entry.reports.includes("ai-personal")) {
    return { ok: false, error: `${reportDate} manifest entry does not include ai-personal` };
  }
  return { ok: true, entry };
}

// ---------------------------------------------------------------------------
// Testable orchestration — extracted from main()
// ---------------------------------------------------------------------------

export interface FeishuSendResult {
  success: boolean;
  skipped: boolean;
  error?: string;
}

export interface FeishuSendDeps {
  env: Record<string, string>;
  fetchManifest: () => Promise<{ dates: ManifestEntry[] }>;
  readPersonalDigest: (date: string) => PersonalReportJson;
  fetchFn: typeof globalThis.fetch;
  stateStore: NotificationStateStore;
  checkPublished: (pagesUrl: string, date: string, generatedAt: string) => Promise<string | null>;
  forceSend?: boolean;
}

export async function executeFeishuSend(deps: FeishuSendDeps): Promise<FeishuSendResult> {
  const {
    env,
    fetchManifest,
    readPersonalDigest,
    fetchFn,
    stateStore,
    checkPublished,
    forceSend = false,
  } = deps;

  const hasApp = !!env["FEISHU_APP_ID"];
  const webhookUrls = (env["FEISHU_WEBHOOK_URLS"] ?? env["FEISHU_WEBHOOK_URL"] ?? "")
    .split(",")
    .map((u: string) => u.trim())
    .filter(Boolean);

  if (!hasApp && !webhookUrls.length) {
    return { success: true, skipped: true };
  }

  const reportDate = env["REPORT_DATE"] ?? "";
  if (!reportDate) {
    return { success: false, skipped: false, error: "REPORT_DATE not set" };
  }

  const { dates } = await fetchManifest();
  const manifestResult = validateManifestEntry(dates, reportDate);
  if (!manifestResult.ok) {
    return { success: false, skipped: false, error: manifestResult.error };
  }
  const { date, reports } = manifestResult.entry!;

  const personalDigest = readPersonalDigest(date);

  // Determine report type
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isMonthly = baseReports.includes("ai-monthly");
  const isWeekly = baseReports.includes("ai-weekly");
  const type = isMonthly ? "monthly" : isWeekly ? "weekly" : "daily";

  // Dedup check (before expensive Pages verification)
  const destination = hasApp ? (env["FEISHU_CHAT_ID"] ?? "") : webhookUrls.join(",");
  const channel = hasApp ? "feishu-openapi" : "feishu-webhook";
  const notifKey = makeNotificationKey(channel, type, date, destination);

  if (stateStore.isAlreadySent(notifKey) && !forceSend) {
    return { success: true, skipped: true };
  }

  // Pages publication gate — must pass before contacting Feishu
  const PAGES_URL = (env["PAGES_URL"] ?? SITE_PAGES_URL).replace(/\/$/, "");
  const publishError = await checkPublished(PAGES_URL, date, personalDigest.generatedAt);
  if (publishError) {
    return { success: false, skipped: false, error: `Pages 发布检查失败: ${publishError}` };
  }

  const card = buildCard({ date, reports, pagesUrl: PAGES_URL, personalDigest, type });

  if (hasApp) {
    // Open API path
    const chatId = env["FEISHU_CHAT_ID"] ?? "";
    if (!chatId) {
      return { success: false, skipped: false, error: "FEISHU_CHAT_ID is required" };
    }

    const uuid = makeFeishuUuid(type, date, destination, forceSend);

    try {
      const tokenResp = await fetchFn(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: env["FEISHU_APP_ID"] ?? "",
            app_secret: env["FEISHU_APP_SECRET"] ?? "",
          }),
        },
      );
      const tokenData = (await tokenResp.json()) as { code: number; tenant_access_token?: string };
      if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
        return { success: false, skipped: false, error: `Token error ${tokenData.code}` };
      }

      const sendResp = await fetchFn(
        "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenData.tenant_access_token}`,
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: "interactive",
            content: JSON.stringify(card),
            uuid,
          }),
        },
      );

      if (!sendResp.ok) {
        return { success: false, skipped: false, error: `Send API ${sendResp.status}` };
      }

      const sendData = (await sendResp.json()) as { code: number; msg: string };
      if (sendData.code !== 0) {
        return { success: false, skipped: false, error: `Send error ${sendData.code}: ${sendData.msg}` };
      }

      stateStore.recordSend(notifKey);
      return { success: true, skipped: false };
    } catch (e) {
      return { success: false, skipped: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Webhook path — per-webhook dedup
  const failedUrls: string[] = [];

  for (const url of webhookUrls) {
    const whKey = makeNotificationKey("feishu-webhook", type, date, url);

    if (stateStore.isAlreadySent(whKey) && !forceSend) {
      continue; // already sent
    }

    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg_type: "interactive", card }),
      });
      if (!res.ok) {
        failedUrls.push(url);
        continue;
      }
      stateStore.recordSend(whKey);
    } catch {
      failedUrls.push(url);
    }
  }

  if (failedUrls.length > 0) {
    return {
      success: false,
      skipped: false,
      error: `${failedUrls.length}/${webhookUrls.length} webhook(s) failed`,
    };
  }

  return { success: true, skipped: false };
}

// ---------------------------------------------------------------------------
// Generate deterministic uuid (exported for testing)
// ---------------------------------------------------------------------------

export function makeFeishuUuid(
  reportType: string,
  date: string,
  destination: string,
  forceSend: boolean,
): string {
  if (forceSend) {
    const base = makeFeishuIdempotencyKey(reportType, date, destination);
    return `${base}-${crypto.randomBytes(4).toString("hex")}`.slice(0, 50);
  }
  return makeFeishuIdempotencyKey(reportType, date, destination);
}

// ---------------------------------------------------------------------------
// Main — only runs when executed directly (tsx src/feishu.ts)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const result = await executeFeishuSend({
    env: process.env as Record<string, string>,
    fetchManifest: async () => {
      if (!fs.existsSync("manifest.json")) {
        throw new Error("manifest.json not found");
      }
      return JSON.parse(fs.readFileSync("manifest.json", "utf-8"));
    },
    readPersonalDigest: (date: string) => {
      const digestPath = path.join("digests", date, "personal-digest.json");
      if (!fs.existsSync(digestPath)) throw new Error("personal-digest.json not found");
      const raw = JSON.parse(fs.readFileSync(digestPath, "utf-8"));
      const schemaError = guardReportSchema(raw);
      if (schemaError) throw new Error(`Schema invalid: ${schemaError}`);
      return raw as PersonalReportJson;
    },
    fetchFn: globalThis.fetch,
    stateStore: createProductionStore(),
    checkPublished: checkReportPublished,
    forceSend: process.env["FORCE_SEND"] === "true",
  });

  if (!result.success) {
    console.error(`[feishu] ${result.error}`);
    process.exit(1);
  }
  if (result.skipped) {
    console.log("[feishu] Skipped (no credentials or already sent).");
  } else {
    console.log("[feishu] Done!");
  }
}

// Only auto-send when run directly (`tsx src/feishu.ts`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error("[feishu]", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
