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
import type { Highlights } from "./notify.ts";
import type { OpportunityCard } from "./prompts-data.ts";

const PAGES_URL_DEFAULT = "https://duanyytop.github.io/agents-radar";

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
  highlights: Highlights | null;
  opportunity: OpportunityCard | null;
  type: "daily" | "weekly" | "monthly";
}

function buildCard(ctx: CardContext): unknown {
  const { date, reports, pagesUrl, highlights, opportunity, type } = ctx;
  const baseReports = reports.filter((r) => !r.endsWith("-en"));

  const icon = type === "monthly" ? "📆" : type === "weekly" ? "📅" : "📡";
  const suffix = type === "monthly" ? " 月报" : type === "weekly" ? " 周报" : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = [];

  // --- Opportunity section (narrative style) ---
  if (opportunity?.summary || opportunity?.signals?.length) {
    if (opportunity.summary) {
      elements.push({
        tag: "markdown",
        content: `**🔥 今日一句话**\n\n${escapeMarkdown(opportunity.summary)}`,
      });
    }

    if (opportunity.signals?.length) {
      const signalLines = opportunity.signals.map((s, i) => {
        const reportUrl = s.report ? `${pagesUrl}/#${date}/${s.report}` : "";
        const link = reportUrl ? `  [→ 看报告](${reportUrl})` : "";
        return `${i + 1}. **${escapeMarkdown(s.title)}**\n${escapeMarkdown(s.description)}${link}`;
      });
      elements.push({ tag: "hr" });
      elements.push({
        tag: "markdown",
        content: "**⚡ 值得关注的机会**\n\n" + signalLines.join("\n\n"),
      });
    }
  } else {
    // Fallback: use highlights if opportunity card not available
    const zhHighlights = highlights?.zh ?? {};
    const highlightLines: string[] = [];
    const priorityOrder = [
      "ai-cli",
      "ai-agents",
      "ai-trending",
      "ai-hn",
      "ai-ph",
      "ai-arxiv",
      "ai-hf",
      "ai-community",
    ];
    const ordered =
      type === "weekly"
        ? ["ai-weekly", ...priorityOrder]
        : type === "monthly"
          ? ["ai-monthly", ...priorityOrder]
          : priorityOrder;

    for (const reportId of ordered) {
      if (!baseReports.includes(reportId)) continue;
      const items = zhHighlights[reportId];
      if (!items?.length) continue;
      const label = NOTIFY_LABELS[reportId]?.zh ?? reportId;
      highlightLines.push(`**${label}**`);
      for (const h of items.slice(0, 2)) {
        highlightLines.push(`• ${escapeMarkdown(h)}`);
      }
      highlightLines.push("");
    }

    if (highlightLines.length > 0) {
      elements.push({
        tag: "markdown",
        content: "**📌 今日重点**\n\n" + highlightLines.join("\n"),
      });
    }
  }

  // --- Report links section ---
  elements.push({ tag: "hr" });

  const linkLines: string[] = [];
  const dailyReports = baseReports.filter((r) => !r.includes("weekly") && !r.includes("monthly"));
  const rollupReports = baseReports.filter((r) => r.includes("weekly") || r.includes("monthly"));

  for (const r of [...dailyReports, ...rollupReports]) {
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
    content: "**📎 完整报告**\n\n" + linkLines.join("\n"),
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
  highlights?: Highlights | null,
): string {
  // For backward compatibility: returns a markdown string (used by tests)
  const PAGES_URL = (pagesUrl ?? process.env["PAGES_URL"] ?? PAGES_URL_DEFAULT).replace(/\/$/, "");
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isWeekly = baseReports.includes("ai-weekly");
  const isMonthly = baseReports.includes("ai-monthly");

  const icon = isMonthly ? "📆" : isWeekly ? "📅" : "📡";
  const suffix = isMonthly ? " 月报" : isWeekly ? " 周报" : "";
  const lines: string[] = [`${icon} **agents-radar${suffix} · ${date}**`];

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
      lines.push(`• [${zhLabel}](${zhUrl})  ·  [${enLabel}](${enUrl})`);
    } else {
      lines.push(`• [${zhLabel}](${zhUrl})`);
    }

    const items = zhHighlights[r];
    if (items?.length) {
      for (const h of items) {
        lines.push(`  ◦ ${h}`);
      }
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

  // Load highlights if available
  let highlights: Highlights | null = null;
  const highlightsPath = path.join("digests", date, "highlights.json");
  if (fs.existsSync(highlightsPath)) {
    try {
      highlights = JSON.parse(fs.readFileSync(highlightsPath, "utf-8")) as Highlights;
    } catch {
      console.log("[feishu] Failed to parse highlights.json — sending without highlights.");
    }
  }

  // Load opportunity card if available (preferred over highlights)
  let opportunity: OpportunityCard | null = null;
  const oppPath = path.join("digests", date, "opportunity-card.json");
  if (fs.existsSync(oppPath)) {
    try {
      const allLangs = JSON.parse(fs.readFileSync(oppPath, "utf-8")) as Record<string, OpportunityCard>;
      opportunity = allLangs["zh"] ?? null;
    } catch {
      console.log("[feishu] Failed to parse opportunity-card.json — falling back to highlights.");
    }
  }

  // Determine report type
  const baseReports = reports.filter((r) => !r.endsWith("-en"));
  const isMonthly = baseReports.includes("ai-monthly");
  const isWeekly = baseReports.includes("ai-weekly");
  const type = isMonthly ? "monthly" : isWeekly ? "weekly" : "daily";

  const PAGES_URL = (process.env["PAGES_URL"] ?? PAGES_URL_DEFAULT).replace(/\/$/, "");

  const card = buildCard({ date, reports, pagesUrl: PAGES_URL, highlights, opportunity, type });

  const mode = hasApp ? "Open API" : `${webhooks.length} webhook(s)`;
  console.log(`[feishu] Sending ${type} card to ${mode} for ${date} (${reports.length} reports)…`);
  await sendCard(card);
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
