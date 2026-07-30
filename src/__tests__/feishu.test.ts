import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildFeishuMessage,
  checkReportPublished,
  validateManifestEntry,
  executeFeishuSend,
  makeFeishuUuid,
} from "../feishu.ts";
import type { ManifestEntry } from "../feishu.ts";
import type { PersonalReportJson } from "../personal-report.ts";
import {
  createMemoryStore,
  makeNotificationKey,
  hashDestination,
  makeFeishuIdempotencyKey,
} from "../notification-state.ts";

const BASE_URL = "https://example.com/radar";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DIGEST: PersonalReportJson = {
  generatedAt: "2026-07-27T08:00:00Z",
  coverageFrom: "2026-07-23T08:00:00Z",
  coverageTo: "2026-07-27T08:00:00Z",
  toolStatus: { codex: "ok", "claude-code": "ok" },
  events: [
    {
      filterEventId: "filter-event-1",
      id: "evt-1",
      title: "Claude Code 新增长期记忆功能",
      topic: "Claude Code 新功能",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "new",
      status: "已确认",
      quick: {
        what: "新增长期记忆功能",
        why: "减少重复上下文输入",
        impact: "提高开发效率",
        action: "升级使用",
      },
      full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
      candidateIds: ["https://github.com/anthropics/claude-code/pull/123"],
      sources: [{ name: "GitHub", url: "https://github.com/anthropics/claude-code/pull/123" }],
    },
  ],
  fiveMinuteBrief: { topicGroups: [{ name: "Claude Code 新功能", eventIds: ["evt-1"] }] },
  fullReport: { topicGroups: [{ name: "Claude Code 新功能", eventIds: ["evt-1"] }] },
};

function makeManifest(date: string): { dates: ManifestEntry[] } {
  return { dates: [{ date, reports: ["ai-personal"] }] };
}

function makeDigest(): PersonalReportJson {
  return JSON.parse(JSON.stringify(SAMPLE_DIGEST));
}

function mockFetchSuccess() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("tenant_access_token")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ code: 0, tenant_access_token: "tok" }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, msg: "ok" }) });
  });
}

function alwaysPass(): Promise<string | null> {
  return Promise.resolve(null);
}

// ---------------------------------------------------------------------------
// buildFeishuMessage
// ---------------------------------------------------------------------------

describe("buildFeishuMessage", () => {
  it("builds a daily message with zh + en reports", () => {
    const msg = buildFeishuMessage(
      "2026-03-09",
      ["ai-cli", "ai-cli-en", "ai-agents", "ai-agents-en"],
      BASE_URL,
    );
    expect(msg).toContain("agents-radar");
    expect(msg).toContain("2026-03-09");
    expect(msg).toContain("📡");
    expect(msg).toContain(`[AI CLI 工具](${BASE_URL}/#2026-03-09/ai-cli)`);
  });

  it("shows weekly icon and suffix", () => {
    expect(buildFeishuMessage("2026-03-09", ["ai-weekly"], BASE_URL)).toContain("📅");
  });

  it("shows monthly icon and suffix", () => {
    expect(buildFeishuMessage("2026-03-09", ["ai-monthly"], BASE_URL)).toContain("📆");
  });

  it("monthly takes priority over weekly", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-weekly", "ai-monthly"], BASE_URL);
    expect(msg).toContain("📆");
    expect(msg).toContain("月报");
  });

  it("renders zh-only reports without en link", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-hn"], BASE_URL);
    expect(msg).toContain("HN 社区动态");
    expect(msg).not.toContain("HN Community");
  });

  it("includes Web UI and RSS links", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-cli"], BASE_URL);
    expect(msg).toContain("🌐 Web UI");
    expect(msg).toContain(`${BASE_URL}/feed.xml`);
  });

  it("uses markdown links not HTML", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-cli"], BASE_URL);
    expect(msg).not.toContain("<a href=");
    expect(msg).toContain("**agents-radar");
  });

  it("displays fiveMinuteBrief from personal-digest.json", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("五分钟概览");
    expect(msg).toContain("Claude Code 新增长期记忆功能");
  });

  it("displays toolStatus", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("主力工具状态");
    expect(msg).toContain("codex");
  });

  it("has exactly one report entry link", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain(`${BASE_URL}/#2026-07-27/ai-personal`);
  });

  it("does not include old opportunity section", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).not.toContain("值得关注的机会");
  });

  it("works without personalDigest (null)", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-cli"], BASE_URL, null);
    expect(msg).toContain("AI CLI 工具");
    expect(msg).not.toContain("五分钟概览");
  });

  it("renders what and why with arrow", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("→");
  });
});

// ---------------------------------------------------------------------------
// validateManifestEntry
// ---------------------------------------------------------------------------

describe("validateManifestEntry", () => {
  it("error when dates is null", () => expect(validateManifestEntry(null, "2026-07-27").ok).toBe(false));
  it("error when dates is empty", () => expect(validateManifestEntry([], "2026-07-27").ok).toBe(false));
  it("error when date not in manifest", () => {
    expect(validateManifestEntry([{ date: "2026-07-26", reports: ["ai-personal"] }], "2026-07-27").ok).toBe(
      false,
    );
  });
  it("error when no ai-personal", () => {
    expect(validateManifestEntry([{ date: "2026-07-27", reports: ["ai-cli"] }], "2026-07-27").ok).toBe(false);
  });
  it("success when valid", () => {
    const r = validateManifestEntry([{ date: "2026-07-27", reports: ["ai-personal"] }], "2026-07-27");
    expect(r.ok).toBe(true);
    expect(r.entry!.date).toBe("2026-07-27");
  });
});

// ---------------------------------------------------------------------------
// checkReportPublished
// ---------------------------------------------------------------------------

describe("checkReportPublished", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("rejects empty generatedAt without fetch", async () => {
    globalThis.fetch = vi.fn();
    const r = await checkReportPublished("https://x.com", "2026-07-27", "", 1, 0);
    expect(r).not.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("fails when manifest missing date", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-26", reports: ["ai-personal"] }] }),
        });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "2026-07-27T08:00:00Z", 1, 0);
    expect(r).toContain("不包含");
  });

  it("fails when md returns 404", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: false, status: 404 });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "2026-07-27T08:00:00Z", 1, 0);
    expect(r).toContain("404");
  });

  it("fails when JSON missing generatedAt", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ toolStatus: {} }) });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "2026-07-27T08:00:00Z", 1, 0);
    expect(r).toContain("缺少 generatedAt");
  });

  it("fails when generatedAt mismatch", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ generatedAt: "old" }) });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "new", 1, 0);
    expect(r).toContain("不一致");
  });

  it("fails when JSON unparseable", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json"))
        return Promise.resolve({ ok: true, json: () => Promise.reject(new Error("bad")) });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "t", 1, 0);
    expect(r).toContain("异常");
  });

  it("succeeds when all match", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ generatedAt: "2026-07-27T08:00:00Z" }),
        });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "2026-07-27T08:00:00Z", 1, 0);
    expect(r).toBeNull();
  });

  it("retries and succeeds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        calls++;
        if (calls <= 1) return Promise.resolve({ ok: false, status: 404 });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json"))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ generatedAt: "t" }) });
      return Promise.resolve({ ok: false, status: 404 });
    });
    const r = await checkReportPublished("https://x.com", "2026-07-27", "t", 3, 0);
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// makeFeishuUuid
// ---------------------------------------------------------------------------

describe("makeFeishuUuid", () => {
  it("stable for normal send", () => {
    const a = makeFeishuUuid("daily", "2026-07-27", "chat-123", false);
    const b = makeFeishuUuid("daily", "2026-07-27", "chat-123", false);
    expect(a).toBe(b);
    expect(a.length).toBeLessThanOrEqual(50);
  });

  it("different for FORCE_SEND", () => {
    const n = makeFeishuUuid("daily", "2026-07-27", "chat-123", false);
    const f = makeFeishuUuid("daily", "2026-07-27", "chat-123", true);
    expect(f).not.toBe(n);
    expect(f.length).toBeLessThanOrEqual(50);
  });

  it("two FORCE_SEND produce different uuids", () => {
    expect(makeFeishuUuid("daily", "2026-07-27", "chat-123", true)).not.toBe(
      makeFeishuUuid("daily", "2026-07-27", "chat-123", true),
    );
  });
});

// ---------------------------------------------------------------------------
// executeFeishuSend — all via memory store, no file I/O
// ---------------------------------------------------------------------------

describe("executeFeishuSend", () => {
  const envOpenApi = {
    FEISHU_APP_ID: "id",
    FEISHU_APP_SECRET: "secret",
    FEISHU_CHAT_ID: "chat",
    REPORT_DATE: "2026-07-27",
  };

  it("skips when no credentials", async () => {
    const r = await executeFeishuSend({
      env: {},
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
      stateStore: createMemoryStore(),
      checkPublished: alwaysPass,
    });
    expect(r.skipped).toBe(true);
  });

  it("fails when REPORT_DATE missing", async () => {
    const r = await executeFeishuSend({
      env: { FEISHU_APP_ID: "id", FEISHU_APP_SECRET: "secret", FEISHU_CHAT_ID: "chat" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
      stateStore: createMemoryStore(),
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("REPORT_DATE");
  });

  it("fails when date not in manifest", async () => {
    const r = await executeFeishuSend({
      env: { ...envOpenApi, REPORT_DATE: "2026-07-28" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
      stateStore: createMemoryStore(),
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("not in manifest");
  });

  // --- Pages publication gate ---

  it("fails when checkPublished rejects", async () => {
    const r = await executeFeishuSend({
      env: envOpenApi,
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
      stateStore: createMemoryStore(),
      checkPublished: async () => "md 404",
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("Pages 发布检查失败");
    expect(r.error).toContain("md 404");
  });

  it("checkPublished failure does not call fetchFn", async () => {
    const fetchFn = vi.fn();
    await executeFeishuSend({
      env: envOpenApi,
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: createMemoryStore(),
      checkPublished: async () => "fail",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("checkPublished failure does not record state", async () => {
    const store = createMemoryStore();
    await executeFeishuSend({
      env: envOpenApi,
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
      stateStore: store,
      checkPublished: async () => "fail",
    });
    expect(store.isAlreadySent("anything")).toBe(false);
  });

  // --- Open API path ---

  it("sends via Open API with stable uuid", async () => {
    const fetchFn = mockFetchSuccess();
    const store = createMemoryStore();
    const r = await executeFeishuSend({
      env: envOpenApi,
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchFn.mock.calls[1]![1].body);
    expect(body.uuid).toContain("notif-daily-2026-07-27");
  });

  it("skips when already sent", async () => {
    const key = makeNotificationKey("feishu-openapi", "daily", "2026-07-27", "chat");
    const store = createMemoryStore({ [key]: "2026-07-27T00:00:00Z" });
    const fetchFn = vi.fn();
    const r = await executeFeishuSend({
      env: envOpenApi,
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(true);
    expect(r.skipped).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("FORCE_SEND bypasses dedup with different uuid", async () => {
    const key = makeNotificationKey("feishu-openapi", "daily", "2026-07-27", "chat");
    const store = createMemoryStore({ [key]: "2026-07-27T00:00:00Z" });
    const fetchFn = mockFetchSuccess();
    const r = await executeFeishuSend({
      env: { ...envOpenApi, FORCE_SEND: "true" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished: alwaysPass,
      forceSend: true,
    });
    expect(r.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("API failure does not record send", async () => {
    const store = createMemoryStore();
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("tenant_access_token"))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 0, tenant_access_token: "tok" }),
        });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 230001, msg: "err" }) });
    });
    const r = await executeFeishuSend({
      env: envOpenApi,
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(false);
    expect(store.isAlreadySent(makeNotificationKey("feishu-openapi", "daily", "2026-07-27", "chat"))).toBe(
      false,
    );
  });

  // --- Webhook per-target dedup ---

  it("webhook: sends to all targets on first run", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const store = createMemoryStore();
    const r = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("webhook: partial failure returns failure", async () => {
    let n = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      n++;
      if (n === 1) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("err") });
    });
    const r = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: createMemoryStore(),
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("failed");
  });

  it("webhook: second run only retries failed", async () => {
    let n = 0;
    const store = createMemoryStore();
    await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn().mockImplementation(() => {
        n++;
        return n === 1
          ? Promise.resolve({ ok: true })
          : Promise.resolve({ ok: false, status: 500, text: () => "err" });
      }),
      stateStore: store,
      checkPublished: alwaysPass,
    });
    const fetchFn2 = vi.fn().mockResolvedValue({ ok: true });
    const r = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn2,
      stateStore: store,
      checkPublished: alwaysPass,
    });
    expect(r.success).toBe(true);
    expect(fetchFn2).toHaveBeenCalledTimes(1); // only the failed one
  });

  it("webhook: FORCE_SEND resends all", async () => {
    const store = createMemoryStore();
    await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn().mockResolvedValue({ ok: true }),
      stateStore: store,
      checkPublished: alwaysPass,
    });
    const fetchFn2 = vi.fn().mockResolvedValue({ ok: true });
    await executeFeishuSend({
      env: {
        FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2",
        REPORT_DATE: "2026-07-27",
        FORCE_SEND: "true",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn2,
      stateStore: store,
      checkPublished: alwaysPass,
      forceSend: true,
    });
    expect(fetchFn2).toHaveBeenCalledTimes(2);
  });

  it("webhook: all failure records nothing", async () => {
    const store = createMemoryStore();
    await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => "err" }),
      stateStore: store,
      checkPublished: alwaysPass,
    });
    expect(
      store.isAlreadySent(makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://a.com/1")),
    ).toBe(false);
    expect(
      store.isAlreadySent(makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://b.com/2")),
    ).toBe(false);
  });

  it("webhook: both already sent → skipped, no checkPublished, no fetch", async () => {
    const store = createMemoryStore({
      [makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://a.com/1")]: "t",
      [makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://b.com/2")]: "t",
    });
    const checkPublished = vi.fn();
    const fetchFn = vi.fn();
    const r = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished,
    });
    expect(r.success).toBe(true);
    expect(r.skipped).toBe(true);
    expect(checkPublished).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("webhook: one sent one pending → checkPublished once, only send pending", async () => {
    const store = createMemoryStore({
      [makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://a.com/1")]: "t",
    });
    const checkPublished = vi.fn().mockResolvedValue(null);
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const r = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1,https://b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished,
    });
    expect(r.success).toBe(true);
    expect(checkPublished).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1); // only the pending one
    expect(
      store.isAlreadySent(makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://b.com/2")),
    ).toBe(true);
  });

  it("webhook: FORCE_SEND + Pages fail → nothing sent, no state", async () => {
    const store = createMemoryStore();
    const fetchFn = vi.fn();
    const r = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://a.com/1", REPORT_DATE: "2026-07-27", FORCE_SEND: "true" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
      stateStore: store,
      checkPublished: async () => "Pages not ready",
      forceSend: true,
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain("Pages");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(
      store.isAlreadySent(makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://a.com/1")),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Notification state module
// ---------------------------------------------------------------------------

describe("notification state module", () => {
  it("hashDestination consistent 12-char", () => {
    expect(hashDestination("chat-123")).toBe(hashDestination("chat-123"));
    expect(hashDestination("chat-123")).toHaveLength(12);
  });

  it("different inputs produce different hashes", () => {
    expect(hashDestination("a")).not.toBe(hashDestination("b"));
  });

  it("makeNotificationKey no raw secret", () => {
    const key = makeNotificationKey("telegram", "daily", "2026-07-27", "secret-chat");
    expect(key).not.toContain("secret-chat");
    expect(key).toContain(hashDestination("secret-chat"));
  });

  it("makeFeishuIdempotencyKey ≤50 chars", () => {
    expect(makeFeishuIdempotencyKey("daily", "2026-07-27", "chat-12345").length).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// Workflow static checks
// ---------------------------------------------------------------------------

describe("workflow checks", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  let wf: string;
  try {
    wf = fs.readFileSync(".github/workflows/daily-digest.yml", "utf-8");
  } catch {
    wf = "";
  }

  it("uses TZ=Asia/Shanghai", () => expect(wf).toContain("TZ=Asia/Shanghai date +%Y-%m-%d"));
  it("feishu uses steps.date.outputs.REPORT_DATE", () =>
    expect(wf).toContain("steps.date.outputs.REPORT_DATE"));
  it("no UTC date -u", () => expect(wf).not.toContain("date -u +%Y-%m-%d"));
  it("no empty schedule expression", () =>
    expect(wf).not.toContain("github.event.schedule == '' && '' || ''"));
  it("Telegram has REPORT_DATE", () => {
    const section = wf.split("Send Telegram")[1]?.split("Send Feishu")[0] ?? "";
    expect(section).toContain("REPORT_DATE");
  });
  it("persist uses if: always()", () => {
    expect(wf.split("Persist notification state")[1] ?? "").toContain("always()");
  });
  it("persist checks file existence", () => {
    expect(wf.split("Persist notification state")[1] ?? "").toContain("notification-state.json");
  });
});
