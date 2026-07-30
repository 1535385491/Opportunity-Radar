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
import { pathToFileURL } from "node:url";
import { NOTIFY_LABELS } from "./i18n.ts";
import { PAGES_URL as SITE_PAGES_URL } from "./site.ts";
import { guardReportSchema } from "./personal-report.ts";
import type { PersonalReportJson } from "./personal-report.ts";
import {
  isAlreadySent,
  recordSend,
  makeNotificationKey,
  makeFeishuIdempotencyKey,
} from "./notification-state.ts";

// ---------------------------------------------------------------------------
// Notification dedup state
// ---------------------------------------------------------------------------

export interface NotificationState {
  sent: Record<string, string>; // key → ISO timestamp of last send
}

const NOTIFICATION_STATE_FILE = path.join("digests", "notification-state.json");

export function loadNotificationState(): NotificationState {
  try {
    if (!fs.existsSync(NOTIFICATION_STATE_FILE)) return { sent: {} };
    return JSON.parse(fs.readFileSync(NOTIFICATION_STATE_FILE, "utf-8")) as NotificationState;
  } catch {
    return { sent: {} };
  }
}

export function saveNotificationState(state: NotificationState): void {
  fs.mkdirSync(path.dirname(NOTIFICATION_STATE_FILE), { recursive: true });
  fs.writeFileSync(NOTIFICATION_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function makeSendKey(type: string, date: string): string {
  return `${type}:${date}`;
}

// ---------------------------------------------------------------------------
// Feishu Open API — app-based authentication
// ---------------------------------------------------------------------------

interface TenantTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TenantTokenCache | null = null;

async function getTenantToken(): Promise<string> {
  const appId = process.env["FEISHU_APP_ID"] ?? "";
  const appSecret = process.env["FEISHU_APP_SECRET"] ?? "";

  if (!appId || !appSecret) throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required");

  // Return cached token if still valid (with 5 min safety margin)
  if (tokenCache && Date.now() < tokenCache.expiresAt - 300_000) {
    return tokenCache.token;
  }

  const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  if (!resp.ok) throw new Error(`Feishu token API ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as {
    code: number;
    msg: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Feishu token error ${data.code}: ${data.msg}`);
  }

  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire ?? 7200) * 1000,
  };

  return tokenCache.token;
}

async function sendViaOpenApi(card: unknown, uuid?: string): Promise<void> {
  const chatId = process.env["FEISHU_CHAT_ID"] ?? "";
  if (!chatId) throw new Error("FEISHU_CHAT_ID is required");

  const token = await getTenantToken();

  const resp = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "interactive",
      content: JSON.stringify(card),
      uuid: uuid || undefined,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Feishu send API ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as { code: number; msg: string };
  if (data.code !== 0) {
    throw new Error(`Feishu send error ${data.code}: ${data.msg}`);
  }
}

// ---------------------------------------------------------------------------
// Webhook mode (legacy)
// ---------------------------------------------------------------------------

function getWebhookUrls(): string[] {
  const raw = process.env["FEISHU_WEBHOOK_URLS"] ?? process.env["FEISHU_WEBHOOK_URL"] ?? "";
  return raw
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

async function sendViaWebhook(webhookUrl: string, card: unknown): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg_type: "interactive", card }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Feishu webhook ${res.status}: ${body}`);
  }
}

async function sendViaWebhooks(card: unknown): Promise<void> {
  const urls = getWebhookUrls();
  if (!urls.length) throw new Error("No Feishu webhook URLs configured");
  const results = await Promise.allSettled(urls.map((url) => sendViaWebhook(url, card)));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length) {
    const msgs = failures.map((r) => (r as PromiseRejectedResult).reason);
    console.error(`[feishu] ${failures.length}/${urls.length} webhook(s) failed:`, msgs);
    if (failures.length === urls.length) throw new Error("All Feishu webhooks failed");
  }
}

// ---------------------------------------------------------------------------
// Unified send — prefers Open API, falls back to webhooks
// ---------------------------------------------------------------------------

async function sendCard(card: unknown, uuid?: string): Promise<void> {
  const hasApp = !!process.env["FEISHU_APP_ID"];
  const hasWebhook = getWebhookUrls().length > 0;

  if (hasApp) {
    await sendViaOpenApi(card, uuid);
  } else if (hasWebhook) {
    await sendViaWebhooks(card);
  } else {
    console.log("[feishu] Neither FEISHU_APP_ID nor FEISHU_WEBHOOK_URLS set — skipping.");
  }
}

// ---------------------------------------------------------------------------
// Card builder — narrative + opportunity signals, mobile-friendly
// ---------------------------------------------------------------------------

function escapeMarkdown(s: string): string {
  // Feishu markdown: escape [ ] ( ) ` ~ only when they could break syntax
  return s.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

interface CardContext {
  date: string;
  reports: string[];
  pagesUrl: string;
  personalDigest: PersonalReportJson | null;
  type: "daily" | "weekly" | "monthly";
}

function buildCard(ctx: CardContext): unknown {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export { buildCard };

/**
 * Generates feishu-card.json and feishu-preview.md from a PersonalReportJson.
 * Used by both DRY_RUN and normal runs — single source of truth.
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

  // Human-readable preview
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
// Pre-send publication check
// ---------------------------------------------------------------------------

/**
 * Verifies that the target date's ai-personal report is actually published
 * on the public Pages site before allowing Feishu notification.
 *
 * Checks (per retry):
 *  1. Remote manifest contains the target date with ai-personal
 *  2. The ai-personal.md file returns HTTP 200
 *  3. The personal-digest.json returns 200 and its generatedAt matches expectedGeneratedAt
 *
 * Uses cache-busting query params and bounded retry to handle Pages deploy delay.
 * Returns null on success, or an error message on final failure.
 */
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

/**
 * Validates that the manifest contains the target date with ai-personal.
 * Pure function — no file I/O, no process.exit.
 */
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
// Main — only runs when executed directly (tsx src/feishu.ts)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hasApp = !!process.env["FEISHU_APP_ID"];
  const webhooks = getWebhookUrls();

  if (!hasApp && !webhooks.length) {
    console.log("[feishu] Neither FEISHU_APP_ID nor FEISHU_WEBHOOK_URLS set — skipping.");
    return;
  }

  // Explicit REPORT_DATE — do not guess from manifest
  const reportDate = process.env["REPORT_DATE"] ?? "";
  if (!reportDate) {
    console.error("[feishu] REPORT_DATE not set — refusing to send without explicit date.");
    process.exit(1);
  }

  if (!fs.existsSync("manifest.json")) {
    console.error("[feishu] manifest.json not found — refusing to send.");
    process.exit(1);
  }

  const { dates } = JSON.parse(fs.readFileSync("manifest.json", "utf-8")) as {
    dates: ManifestEntry[];
  };

  const manifestResult = validateManifestEntry(dates, reportDate);
  if (!manifestResult.ok) {
    console.error(`[feishu] ${manifestResult.error} — refusing to send.`);
    process.exit(1);
  }
  const { date, reports } = manifestResult.entry!;

  // Load and validate personal-digest.json
  let personalDigest: PersonalReportJson | null = null;
  const digestPath = path.join("digests", date, "personal-digest.json");
  if (fs.existsSync(digestPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(digestPath, "utf-8"));
      const schemaError = guardReportSchema(raw);
      if (schemaError) {
        console.error(`[feishu] personal-digest.json schema invalid: ${schemaError} — refusing to send.`);
        process.exit(1);
      }
      personalDigest = raw as PersonalReportJson;
    } catch {
      console.error("[feishu] Failed to parse personal-digest.json — refusing to send.");
      process.exit(1);
    }
  } else {
    console.error("[feishu] personal-digest.json not found — refusing to send.");
    process.exit(1);
  }

  // Determine report type
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isMonthly = baseReports.includes("ai-monthly");
  const isWeekly = baseReports.includes("ai-weekly");
  const type = isMonthly ? "monthly" : isWeekly ? "weekly" : "daily";

  const PAGES_URL = SITE_PAGES_URL;

  // Dedup check using shared notification state
  const channel = hasApp ? "feishu-openapi" : "feishu-webhook";
  const destination = hasApp ? (process.env["FEISHU_CHAT_ID"] ?? "") : getWebhookUrls().join(",");
  const forceSend = process.env["FORCE_SEND"] === "true";
  const notifKey = makeNotificationKey(channel, type, date, destination);

  if (isAlreadySent(notifKey) && !forceSend) {
    console.log(`[feishu] Already sent ${notifKey} — skipping. Use FORCE_SEND=true to resend.`);
    return;
  }

  // Pre-send publication check with retry
  const publishCheck = await checkReportPublished(PAGES_URL, date, personalDigest.generatedAt);
  if (publishCheck) {
    console.error(`[feishu] 发送前检查失败: ${publishCheck} — 拒绝发送。`);
    process.exit(1);
  }

  const card = buildCard({ date, reports, pagesUrl: PAGES_URL, personalDigest, type });

  const mode = hasApp ? "Open API" : `${webhooks.length} webhook(s)`;
  console.log(`[feishu] Sending ${type} card to ${mode} for ${date} (${reports.length} reports)…`);

  // Generate deterministic uuid for Open API idempotency
  const uuid = hasApp ? makeFeishuIdempotencyKey(type, date, destination) : undefined;
  await sendCard(card, uuid);

  // Record successful send using shared module
  recordSend(notifKey);

  console.log("[feishu] Done!");
}

// Only auto-send when run directly (`tsx src/feishu.ts`). Guard prevents an
// accidental send when another module imports from here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error("[feishu]", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
