import { describe, it, expect, vi } from "vitest";
import { buildMessage, executeTelegramSend } from "../notify.ts";
import type { TelegramSendDeps } from "../notify.ts";
import { createMemoryStore, makeNotificationKey } from "../notification-state.ts";

const BASE_URL = "https://example.com/radar";

// ---------------------------------------------------------------------------
// buildMessage
// ---------------------------------------------------------------------------

describe("buildMessage", () => {
  it("builds daily message with zh + en", () => {
    const msg = buildMessage("2026-03-09", ["ai-cli", "ai-cli-en"], BASE_URL);
    expect(msg).toContain("agents-radar");
    expect(msg).toContain("2026-03-09");
    expect(msg).toContain("📡");
    expect(msg).toContain(`${BASE_URL}/#2026-03-09/ai-cli`);
  });

  it("weekly icon", () => {
    expect(buildMessage("2026-03-09", ["ai-weekly"], BASE_URL)).toContain("📅");
  });

  it("monthly icon", () => {
    expect(buildMessage("2026-03-09", ["ai-monthly"], BASE_URL)).toContain("📆");
  });

  it("renders zh-only without en link", () => {
    const msg = buildMessage("2026-03-09", ["ai-hn"], BASE_URL);
    expect(msg).toContain("HN 社区动态");
    expect(msg).not.toContain("HN Community");
  });

  it("includes Web UI and RSS", () => {
    const msg = buildMessage("2026-03-09", ["ai-cli"], BASE_URL);
    expect(msg).toContain("🌐 Web UI");
    expect(msg).toContain(`${BASE_URL}/feed.xml`);
  });

  it("includes highlights", () => {
    const msg = buildMessage("2026-03-09", ["ai-cli"], BASE_URL, {
      zh: { "ai-cli": ["Claude Code v1.2"] },
      en: {},
    });
    expect(msg).toContain("◦ Claude Code v1.2");
  });

  it("works without highlights", () => {
    const msg = buildMessage("2026-03-09", ["ai-cli"], BASE_URL, null);
    expect(msg).not.toContain("◦");
  });
});

// ---------------------------------------------------------------------------
// executeTelegramSend — all via memory store
// ---------------------------------------------------------------------------

describe("executeTelegramSend", () => {
  function makeDeps(overrides: Partial<TelegramSendDeps> = {}): TelegramSendDeps {
    return {
      env: { TELEGRAM_BOT_TOKEN: "token", TELEGRAM_CHAT_ID: "chat-123", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => ({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
      fetchFn: vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) }),
      stateStore: createMemoryStore(),
      ...overrides,
    };
  }

  it("skips when no TELEGRAM_BOT_TOKEN", async () => {
    const r = await executeTelegramSend(makeDeps({ env: { REPORT_DATE: "2026-07-27" } }));
    expect(r.skipped).toBe(true);
  });

  it("fails when REPORT_DATE missing", async () => {
    const r = await executeTelegramSend(makeDeps({ env: { TELEGRAM_BOT_TOKEN: "tok" } }));
    expect(r.success).toBe(false);
    expect(r.error).toContain("REPORT_DATE");
  });

  it("fails when manifest is empty", async () => {
    const r = await executeTelegramSend(makeDeps({ fetchManifest: async () => ({ dates: [] }) }));
    expect(r.success).toBe(false);
    expect(r.error).toContain("empty");
  });

  it("fails when REPORT_DATE only in history, not first entry", async () => {
    const r = await executeTelegramSend(
      makeDeps({
        fetchManifest: async () => ({
          dates: [
            { date: "2026-07-28", reports: ["ai-personal"] },
            { date: "2026-07-27", reports: ["ai-personal"] },
          ],
        }),
      }),
    );
    expect(r.success).toBe(false);
    expect(r.error).toContain("2026-07-28");
    expect(r.error).toContain("2026-07-27");
  });

  it("sends when latest date matches REPORT_DATE", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    const store = createMemoryStore();
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(store.isAlreadySent(makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123"))).toBe(
      true,
    );
  });

  it("second run skips before fetch", async () => {
    const store = createMemoryStore();
    await executeTelegramSend(makeDeps({ stateStore: store }));
    const fetchFn = vi.fn();
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(true);
    expect(r.skipped).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("FORCE_SEND resends", async () => {
    const store = createMemoryStore();
    await executeTelegramSend(makeDeps({ stateStore: store }));
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    const r = await executeTelegramSend(
      makeDeps({
        fetchFn,
        stateStore: store,
        forceSend: true,
        env: {
          TELEGRAM_BOT_TOKEN: "token",
          TELEGRAM_CHAT_ID: "chat-123",
          REPORT_DATE: "2026-07-27",
          FORCE_SEND: "true",
        },
      }),
    );
    expect(r.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("API failure does not record send", async () => {
    const store = createMemoryStore();
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("err") });
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(false);
    expect(store.isAlreadySent(makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123"))).toBe(
      false,
    );
  });

  it("HTTP 200 + { ok: true } succeeds and records", async () => {
    const store = createMemoryStore();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(true);
    expect(store.isAlreadySent(makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123"))).toBe(
      true,
    );
  });

  it("HTTP 200 + { ok: false } fails and does not record", async () => {
    const store = createMemoryStore();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, description: "Bad request" }),
    });
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(false);
    expect(r.error).toContain("Bad request");
    expect(store.isAlreadySent(makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123"))).toBe(
      false,
    );
  });

  it("HTTP 200 + invalid JSON fails and does not record", async () => {
    const store = createMemoryStore();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error("invalid json")),
    });
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(false);
    expect(r.error).toContain("invalid JSON");
    expect(store.isAlreadySent(makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123"))).toBe(
      false,
    );
  });

  it("error message does not leak bot token", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, description: "Unauthorized" }),
    });
    const r = await executeTelegramSend(
      makeDeps({
        fetchFn,
        env: {
          TELEGRAM_BOT_TOKEN: "super-secret-token-123",
          TELEGRAM_CHAT_ID: "chat",
          REPORT_DATE: "2026-07-27",
        },
      }),
    );
    expect(r.success).toBe(false);
    expect(r.error).not.toContain("super-secret-token-123");
  });

  it("does not log bot token", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: string[]) => logs.push(args.join(" "));
    try {
      await executeTelegramSend(makeDeps());
      expect(logs.join(" ")).not.toContain("token");
    } finally {
      console.log = origLog;
    }
  });

  // --- Token redaction in all error paths ---

  it("fetchFn throw with URL containing token → error redacted", async () => {
    const secret = "super-secret-bot-token-xyz";
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new Error(`Failed to fetch https://api.telegram.org/bot${secret}/sendMessage`));
    const store = createMemoryStore();
    const r = await executeTelegramSend(
      makeDeps({
        fetchFn,
        stateStore: store,
        env: { TELEGRAM_BOT_TOKEN: secret, TELEGRAM_CHAT_ID: "chat", REPORT_DATE: "2026-07-27" },
      }),
    );
    expect(r.success).toBe(false);
    expect(r.error).not.toContain(secret);
    expect(r.error).toContain("[REDACTED]");
    expect(store.isAlreadySent(makeNotificationKey("telegram", "daily", "2026-07-27", "chat"))).toBe(false);
  });

  it("HTTP non-2xx with body containing token → redacted", async () => {
    const secret = "leaked-token-body";
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(`Unauthorized: token=${secret}`),
    });
    const r = await executeTelegramSend(
      makeDeps({
        fetchFn,
        env: { TELEGRAM_BOT_TOKEN: secret, TELEGRAM_CHAT_ID: "chat", REPORT_DATE: "2026-07-27" },
      }),
    );
    expect(r.success).toBe(false);
    expect(r.error).not.toContain(secret);
  });

  it("ok:false with description containing token → redacted", async () => {
    const secret = "desc-leak-token";
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, description: `bad token ${secret}` }),
    });
    const r = await executeTelegramSend(
      makeDeps({
        fetchFn,
        env: { TELEGRAM_BOT_TOKEN: secret, TELEGRAM_CHAT_ID: "chat", REPORT_DATE: "2026-07-27" },
      }),
    );
    expect(r.success).toBe(false);
    expect(r.error).not.toContain(secret);
  });

  // --- FORCE_SEND from env ---

  it("FORCE_SEND=true from env bypasses dedup without explicit deps.forceSend", async () => {
    const store = createMemoryStore({
      [makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123")]: "2026-07-27T00:00:00Z",
    });
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    const r = await executeTelegramSend(
      makeDeps({
        fetchFn,
        stateStore: store,
        env: {
          TELEGRAM_BOT_TOKEN: "tok",
          TELEGRAM_CHAT_ID: "chat-123",
          REPORT_DATE: "2026-07-27",
          FORCE_SEND: "true",
        },
        // Note: no forceSend in deps — must be inferred from env
      }),
    );
    expect(r.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("FORCE_SEND not set → still skips duplicate", async () => {
    const store = createMemoryStore({
      [makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123")]: "2026-07-27T00:00:00Z",
    });
    const fetchFn = vi.fn();
    const r = await executeTelegramSend(makeDeps({ fetchFn, stateStore: store }));
    expect(r.success).toBe(true);
    expect(r.skipped).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// buildMessage edge cases
// ---------------------------------------------------------------------------

describe("buildMessage edge cases", () => {
  it("correct zh/en labels and links for bilingual reports", () => {
    const msg = buildMessage("2026-07-27", ["ai-cli", "ai-cli-en", "ai-hn"], "https://example.com");
    expect(msg).toContain("AI CLI 工具");
    expect(msg).toContain("AI CLI Tools");
    expect(msg).toContain("https://example.com/#2026-07-27/ai-cli");
    expect(msg).toContain("https://example.com/#2026-07-27/ai-cli-en");
  });

  it("monthly takes priority over weekly", () => {
    const msg = buildMessage("2026-07-27", ["ai-weekly", "ai-monthly"], "https://example.com");
    expect(msg).toContain("📆");
    // Title line should use monthly suffix, not weekly
    expect(msg).toContain("agents-radar 月报");
    expect(msg).not.toContain("agents-radar 周报");
  });

  it("trailing slash in PAGES_URL does not produce double slash", () => {
    const msg = buildMessage("2026-07-27", ["ai-cli"], "https://example.com/");
    expect(msg).not.toContain("//#");
    expect(msg).toContain("https://example.com/#2026-07-27/ai-cli");
  });

  it("highlights undefined does not produce bullet points", () => {
    const msg = buildMessage("2026-07-27", ["ai-cli"], "https://example.com", undefined);
    expect(msg).not.toContain("◦");
  });

  it("uses default PAGES_URL from site.ts when not provided", () => {
    const msg = buildMessage("2026-07-27", ["ai-cli"]);
    expect(msg).toContain("1535385491.github.io");
    expect(msg).toContain("Opportunity-Radar");
  });
});
