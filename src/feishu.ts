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
import type { PersonalReportJson } from "./personal-report.ts";

const PAGES_URL_DEFAULT = "https://duanyytop.github.io/agents-radar";

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

async function sendViaOpenApi(card: unknown): Promise<void> {
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

async function sendCard(card: unknown): Promise<void> {
  const hasApp = !!process.env["FEISHU_APP_ID"];
  const hasWebhook = getWebhookUrls().length > 0;

  if (hasApp) {
    await sendViaOpenApi(card);
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

  // --- Overview from personal-digest.json ---
  if (personalDigest?.overview?.length) {
    const overviewLines = personalDigest.overview.map(
      (o, i) => `${i + 1}. **${escapeMarkdown(o.topic)}**：${escapeMarkdown(o.summary)}`,
    );
    elements.push({
      tag: "markdown",
      content: `**📋 五分钟概览**\n\n${overviewLines.join("\n")}`,
    });
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

export function buildFeishuMessage(
  date: string,
  reports: string[],
  pagesUrl?: string,
  personalDigest?: PersonalReportJson | null,
): string {
  const PAGES_URL = (pagesUrl ?? process.env["PAGES_URL"] ?? PAGES_URL_DEFAULT).replace(/\/$/, "");
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isWeekly = baseReports.includes("ai-weekly");
  const isMonthly = baseReports.includes("ai-monthly");

  const icon = isMonthly ? "📆" : isWeekly ? "📅" : "📡";
  const suffix = isMonthly ? " 月报" : isWeekly ? " 周报" : "";
  const lines: string[] = [`${icon} **agents-radar${suffix} · ${date}**`];

  // Overview from personal-digest
  if (personalDigest?.overview?.length) {
    lines.push("");
    lines.push("**📋 五分钟概览**");
    for (const [i, o] of personalDigest.overview.entries()) {
      lines.push(`${i + 1}. **${o.topic}**：${o.summary}`);
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
// Main — only runs when executed directly (tsx src/feishu.ts)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const hasApp = !!process.env["FEISHU_APP_ID"];
  const webhooks = getWebhookUrls();

  if (!hasApp && !webhooks.length) {
    console.log("[feishu] Neither FEISHU_APP_ID nor FEISHU_WEBHOOK_URLS set — skipping.");
    return;
  }

  if (!fs.existsSync("manifest.json")) {
    console.log("[feishu] manifest.json not found — skipping.");
    return;
  }

  const { dates } = JSON.parse(fs.readFileSync("manifest.json", "utf-8")) as {
    dates: { date: string; reports: string[] }[];
  };

  const latest = dates?.[0];
  if (!latest) {
    console.log("[feishu] manifest is empty — skipping.");
    return;
  }
  const { date, reports } = latest;

  // Load personal-digest.json (the single source of truth for Feishu)
  let personalDigest: PersonalReportJson | null = null;
  const digestPath = path.join("digests", date, "personal-digest.json");
  if (fs.existsSync(digestPath)) {
    try {
      personalDigest = JSON.parse(fs.readFileSync(digestPath, "utf-8")) as PersonalReportJson;
    } catch {
      console.log("[feishu] Failed to parse personal-digest.json — sending without content.");
    }
  }

  // Determine report type
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isMonthly = baseReports.includes("ai-monthly");
  const isWeekly = baseReports.includes("ai-weekly");
  const type = isMonthly ? "monthly" : isWeekly ? "weekly" : "daily";

  const PAGES_URL = (process.env["PAGES_URL"] ?? PAGES_URL_DEFAULT).replace(/\/$/, "");

  const card = buildCard({ date, reports, pagesUrl: PAGES_URL, personalDigest, type });

  // Dedup check: skip if already sent for this date unless FORCE_SEND=true
  const sendKey = makeSendKey(type, date);
  const notifState = loadNotificationState();
  const forceSend = process.env["FORCE_SEND"] === "true";

  if (notifState.sent[sendKey] && !forceSend) {
    console.log(`[feishu] Already sent ${sendKey} at ${notifState.sent[sendKey]} — skipping. Use FORCE_SEND=true to resend.`);
    return;
  }

  const mode = hasApp ? "Open API" : `${webhooks.length} webhook(s)`;
  console.log(`[feishu] Sending ${type} card to ${mode} for ${date} (${reports.length} reports)…`);
  await sendCard(card);

  // Record successful send
  notifState.sent[sendKey] = new Date().toISOString();
  saveNotificationState(notifState);

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
