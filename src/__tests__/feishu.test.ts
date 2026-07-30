import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import {
  buildFeishuMessage,
  checkReportPublished,
  validateManifestEntry,
  executeFeishuSend,
  makeFeishuUuid,
} from "../feishu.ts";
import type { ManifestEntry } from "../feishu.ts";
import type { PersonalReportJson } from "../personal-report.ts";

const BASE_URL = "https://example.com/radar";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DIGEST: PersonalReportJson = {
  generatedAt: "2026-07-27T08:00:00Z",
  coverageFrom: "2026-07-23T08:00:00Z",
  coverageTo: "2026-07-27T08:00:00Z",
  toolStatus: {
    codex: "Windows 冻结问题仍未解决",
    "claude-code": "新增记忆功能，建议升级",
  },
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
    {
      filterEventId: "filter-event-2",
      id: "evt-2",
      title: "Codex Windows 冻结问题",
      topic: "Codex 稳定性",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "updated",
      status: "社区信号",
      quick: {
        what: "Windows 冻结问题仍未修复",
        why: "影响 Windows 用户日常使用",
        impact: "影响工作流",
        action: "关注进展",
      },
      full: { background: "b", evidence: "e", analysis: "a", impact: "i", action: "a" },
      candidateIds: ["https://github.com/openai/codex/issues/456"],
      sources: [{ name: "GitHub", url: "https://github.com/openai/codex/issues/456" }],
    },
  ],
  fiveMinuteBrief: {
    topicGroups: [
      { name: "Claude Code 新功能", eventIds: ["evt-1"] },
      { name: "Codex 稳定性", eventIds: ["evt-2"] },
    ],
  },
  fullReport: {
    topicGroups: [
      { name: "Claude Code 新功能", eventIds: ["evt-1"] },
      { name: "Codex 稳定性", eventIds: ["evt-2"] },
    ],
  },
};

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

  it("displays fiveMinuteBrief from personal-digest.json", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("五分钟概览");
    expect(msg).toContain("Claude Code 新增长期记忆功能");
  });

  it("displays toolStatus from personal-digest.json", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("主力工具状态");
    expect(msg).toContain("Windows 冻结问题仍未解决");
  });
});

// ---------------------------------------------------------------------------
// validateManifestEntry
// ---------------------------------------------------------------------------

describe("validateManifestEntry", () => {
  it("returns error when dates is null", () => {
    expect(validateManifestEntry(null, "2026-07-27").ok).toBe(false);
  });

  it("returns error when target date not in manifest", () => {
    const dates: ManifestEntry[] = [{ date: "2026-07-26", reports: ["ai-personal"] }];
    expect(validateManifestEntry(dates, "2026-07-27").ok).toBe(false);
  });

  it("returns error when date has no ai-personal", () => {
    const dates: ManifestEntry[] = [{ date: "2026-07-27", reports: ["ai-cli"] }];
    expect(validateManifestEntry(dates, "2026-07-27").ok).toBe(false);
  });

  it("returns entry when valid", () => {
    const dates: ManifestEntry[] = [{ date: "2026-07-27", reports: ["ai-personal"] }];
    const result = validateManifestEntry(dates, "2026-07-27");
    expect(result.ok).toBe(true);
    expect(result.entry!.date).toBe("2026-07-27");
  });
});

// ---------------------------------------------------------------------------
// checkReportPublished — generatedAt required
// ---------------------------------------------------------------------------

describe("checkReportPublished — generatedAt required", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("rejects empty expectedGeneratedAt without fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const result = await checkReportPublished("https://example.com/pages", "2026-07-27", "", 1, 0);
    expect(result).not.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects when remote generatedAt does not match", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ generatedAt: "2026-07-27T00:00:00Z" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T12:00:00Z",
      1,
      0,
    );
    expect(result).toContain("不一致");
  });

  it("succeeds when all match", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ generatedAt: "2026-07-27T12:00:00Z" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T12:00:00Z",
      1,
      0,
    );
    expect(result).toBeNull();
  });

  it("rejects when remote JSON has no generatedAt", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ toolStatus: {} }) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T12:00:00Z",
      1,
      0,
    );
    expect(result).toContain("缺少 generatedAt");
  });

  it("rejects when remote JSON is unparseable", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json")) {
        return Promise.resolve({ ok: true, json: () => Promise.reject(new Error("bad json")) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T12:00:00Z",
      1,
      0,
    );
    expect(result).toContain("异常");
  });
});

// ---------------------------------------------------------------------------
// makeFeishuUuid — FORCE_SEND produces different uuid
// ---------------------------------------------------------------------------

describe("makeFeishuUuid", () => {
  it("produces stable uuid for normal send", () => {
    const a = makeFeishuUuid("daily", "2026-07-27", "chat-123", false);
    const b = makeFeishuUuid("daily", "2026-07-27", "chat-123", false);
    expect(a).toBe(b);
    expect(a.length).toBeLessThanOrEqual(50);
  });

  it("produces different uuid for FORCE_SEND", () => {
    const normal = makeFeishuUuid("daily", "2026-07-27", "chat-123", false);
    const forced = makeFeishuUuid("daily", "2026-07-27", "chat-123", true);
    expect(forced).not.toBe(normal);
    expect(forced.length).toBeLessThanOrEqual(50);
  });

  it("two FORCE_SEND calls produce different uuids", () => {
    const a = makeFeishuUuid("daily", "2026-07-27", "chat-123", true);
    const b = makeFeishuUuid("daily", "2026-07-27", "chat-123", true);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// executeFeishuSend — real orchestration tests
// ---------------------------------------------------------------------------

describe("executeFeishuSend", () => {
  const origFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.resetModules();
    // Clean notification state before each test
    const { saveNotificationState } = await import("../notification-state.ts");
    saveNotificationState({ sent: {} });
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  function makeManifest(date: string): { dates: ManifestEntry[] } {
    return { dates: [{ date, reports: ["ai-personal"] }] };
  }

  function makeDigest(): PersonalReportJson {
    return { ...SAMPLE_DIGEST };
  }

  it("skips when no credentials", async () => {
    const result = await executeFeishuSend({
      env: {},
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
    });
    expect(result.skipped).toBe(true);
  });

  it("fails when REPORT_DATE missing", async () => {
    const result = await executeFeishuSend({
      env: { FEISHU_APP_ID: "id", FEISHU_APP_SECRET: "secret", FEISHU_CHAT_ID: "chat" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("REPORT_DATE");
  });

  it("fails when date not in manifest", async () => {
    const result = await executeFeishuSend({
      env: {
        FEISHU_APP_ID: "id",
        FEISHU_APP_SECRET: "secret",
        FEISHU_CHAT_ID: "chat",
        REPORT_DATE: "2026-07-28",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: vi.fn(),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in manifest");
  });

  it("sends via Open API with stable uuid", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string, _opts?: Record<string, unknown>) => {
      if (url.includes("tenant_access_token")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 0, tenant_access_token: "tok" }),
        });
      }
      // Return success for any other call
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, msg: "ok" }) });
    });
    const result = await executeFeishuSend({
      env: {
        FEISHU_APP_ID: "id",
        FEISHU_APP_SECRET: "secret",
        FEISHU_CHAT_ID: "chat",
        REPORT_DATE: "2026-07-27",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
    });
    expect(result.success).toBe(true);
    // Verify fetch was called (token + send = 2 calls)
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // Check the second call (send) has uuid in body
    const sendCall = fetchFn.mock.calls[1];
    expect(sendCall).toBeDefined();
    const body = JSON.parse((sendCall![1] as { body: string }).body);
    expect(body.uuid).toBeDefined();
    expect(body.uuid).toContain("notif-daily-2026-07-27");
  });

  it("skips when already sent", async () => {
    // Pre-record a send
    const { recordSend, makeNotificationKey } = await import("../notification-state.ts");
    const key = makeNotificationKey("feishu-openapi", "daily", "2026-07-27", "chat");
    recordSend(key);

    const fetchFn = vi.fn();
    const result = await executeFeishuSend({
      env: {
        FEISHU_APP_ID: "id",
        FEISHU_APP_SECRET: "secret",
        FEISHU_CHAT_ID: "chat",
        REPORT_DATE: "2026-07-27",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
    });
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("FORCE_SEND bypasses dedup and uses different uuid", async () => {
    const fetchFn1 = vi.fn().mockImplementation((url: string) => {
      if (url.includes("tenant_access_token")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 0, tenant_access_token: "tok" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, msg: "ok" }) });
    });
    await executeFeishuSend({
      env: {
        FEISHU_APP_ID: "id",
        FEISHU_APP_SECRET: "secret",
        FEISHU_CHAT_ID: "chat",
        REPORT_DATE: "2026-07-27",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn1,
    });
    const uuid1 = JSON.parse(fetchFn1.mock.calls[1]![1].body).uuid;

    const fetchFn2 = vi.fn().mockImplementation((url: string) => {
      if (url.includes("tenant_access_token")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 0, tenant_access_token: "tok" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 0, msg: "ok" }) });
    });
    const r2 = await executeFeishuSend({
      env: {
        FEISHU_APP_ID: "id",
        FEISHU_APP_SECRET: "secret",
        FEISHU_CHAT_ID: "chat",
        REPORT_DATE: "2026-07-27",
        FORCE_SEND: "true",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn2,
      forceSend: true,
    });
    expect(r2.success).toBe(true);
    const uuid2 = JSON.parse(fetchFn2.mock.calls[1]![1].body).uuid;
    expect(uuid1).not.toBe(uuid2);
  });

  it("does not record send on API failure", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      if (url.includes("tenant_access_token")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ code: 0, tenant_access_token: "tok" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 230001, msg: "error" }) });
    });

    const { isAlreadySent, makeNotificationKey } = await import("../notification-state.ts");
    const key = makeNotificationKey("feishu-openapi", "daily", "2026-07-27", "chat");

    const result = await executeFeishuSend({
      env: {
        FEISHU_APP_ID: "id",
        FEISHU_APP_SECRET: "secret",
        FEISHU_CHAT_ID: "chat",
        REPORT_DATE: "2026-07-27",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
    });
    expect(result.success).toBe(false);
    expect(isAlreadySent(key)).toBe(false);
  });

  // --- Webhook per-target dedup ---

  it("webhook: sends to all targets on first run", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const result = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
    });
    expect(result.success).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("webhook: partial failure returns overall failure", async () => {
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("err") });
    });
    const result = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("failed");
  });

  it("webhook: second run only retries failed targets", async () => {
    let callCount = 0;
    const fetchFn1 = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ ok: true });
      return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve("err") });
    });
    // First run: hook-a succeeds, hook-b fails
    await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn1,
    });

    // Second run: only hook-b should be retried
    const fetchFn2 = vi.fn().mockResolvedValue({ ok: true });
    const result = await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn2,
    });
    expect(result.success).toBe(true);
    // Only 1 fetch (hook-b), hook-a already recorded
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });

  it("webhook: FORCE_SEND resends to all targets", async () => {
    // First run: all succeed
    const fetchFn1 = vi.fn().mockResolvedValue({ ok: true });
    await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn1,
    });

    // Second run with FORCE_SEND
    const fetchFn2 = vi.fn().mockResolvedValue({ ok: true });
    const result = await executeFeishuSend({
      env: {
        FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2",
        REPORT_DATE: "2026-07-27",
        FORCE_SEND: "true",
      },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn: fetchFn2,
      forceSend: true,
    });
    expect(result.success).toBe(true);
    expect(fetchFn2).toHaveBeenCalledTimes(2);
  });

  it("webhook: all failure records nothing", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("err") });
    const { isAlreadySent, makeNotificationKey } = await import("../notification-state.ts");

    await executeFeishuSend({
      env: { FEISHU_WEBHOOK_URLS: "https://hook-a.com/1,https://hook-b.com/2", REPORT_DATE: "2026-07-27" },
      fetchManifest: async () => makeManifest("2026-07-27"),
      readPersonalDigest: () => makeDigest(),
      fetchFn,
    });

    const keyA = makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://hook-a.com/1");
    const keyB = makeNotificationKey("feishu-webhook", "daily", "2026-07-27", "https://hook-b.com/2");
    expect(isAlreadySent(keyA)).toBe(false);
    expect(isAlreadySent(keyB)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Workflow REPORT_DATE and persist checks
// ---------------------------------------------------------------------------

describe("workflow static checks", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  let workflowContent: string;
  try {
    workflowContent = fs.readFileSync(".github/workflows/daily-digest.yml", "utf-8");
  } catch {
    workflowContent = "";
  }

  it("Telegram step has REPORT_DATE", () => {
    const section = workflowContent.split("Send Telegram")[1]?.split("Send Feishu")[0] ?? "";
    expect(section).toContain("REPORT_DATE");
  });

  it("persist step uses if: always()", () => {
    const section = workflowContent.split("Persist notification state")[1] ?? "";
    expect(section).toContain("always()");
  });

  it("persist step checks file existence before git add", () => {
    const section = workflowContent.split("Persist notification state")[1] ?? "";
    expect(section).toContain("if [ ! -f digests/notification-state.json ]");
  });
});
