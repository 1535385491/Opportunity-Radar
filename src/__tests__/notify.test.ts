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
      fetchFn: vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") }),
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
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
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
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
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
});
