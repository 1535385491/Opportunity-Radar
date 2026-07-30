import { describe, it, expect, afterEach, vi } from "vitest";
import { buildFeishuMessage, makeSendKey, checkReportPublished, validateManifestEntry } from "../feishu.ts";
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
      id: "evt-1",
      title: "Claude Code 新增长期记忆功能",
      topic: "Claude Code 新功能",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "new",
      status: "已确认",
      quick: { what: "新增长期记忆功能", why: "减少重复上下文输入", impact: "提高开发效率" },
      full: {
        background: "长期上下文管理",
        evidence: "GitHub PR",
        analysis: "跨会话持久化",
        impact: "提高开发效率",
        action: "升级使用",
      },
      candidateIds: ["https://github.com/anthropics/claude-code/pull/123"],
      sources: [{ name: "GitHub", url: "https://github.com/anthropics/claude-code/pull/123" }],
    },
    {
      id: "evt-2",
      title: "Codex Windows 冻结问题",
      topic: "Codex 稳定性",
      eventTime: "2026-07-27T08:00:00Z",
      updateKind: "updated",
      status: "社区信号",
      quick: { what: "Windows 冻结问题仍未修复", why: "影响 Windows 用户日常使用", impact: "影响工作流" },
      full: {
        background: "Codex Windows 特定问题",
        evidence: "GitHub Issue",
        analysis: "UI 线程阻塞",
        impact: "影响 Windows 用户工作流",
        action: "关注修复进展",
      },
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
  const origPagesUrl = process.env["PAGES_URL"];

  afterEach(() => {
    if (origPagesUrl !== undefined) {
      process.env["PAGES_URL"] = origPagesUrl;
    } else {
      delete process.env["PAGES_URL"];
    }
  });

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
    expect(msg).toContain(`[AI CLI Tools](${BASE_URL}/#2026-03-09/ai-cli-en)`);
  });

  it("shows weekly icon and suffix for weekly reports", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-weekly", "ai-weekly-en"], BASE_URL);
    expect(msg).toContain("📅");
    expect(msg).toContain("周报");
  });

  it("shows monthly icon and suffix for monthly reports", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-monthly", "ai-monthly-en"], BASE_URL);
    expect(msg).toContain("📆");
    expect(msg).toContain("月报");
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
    expect(msg).toContain("RSS");
    expect(msg).toContain(`${BASE_URL}/feed.xml`);
  });

  it("uses markdown links instead of HTML", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-cli", "ai-cli-en"], BASE_URL);
    expect(msg).not.toContain("<a href=");
    expect(msg).not.toContain("<b>");
    expect(msg).toContain("**agents-radar");
    expect(msg).toContain(`[AI CLI 工具](`);
  });

  // --- New: overview and toolStatus from personal-digest.json ---

  it("displays fiveMinuteBrief from personal-digest.json", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("五分钟概览");
    expect(msg).toContain("Claude Code 新增长期记忆功能");
    expect(msg).toContain("新增长期记忆功能");
    expect(msg).toContain("减少重复上下文输入");
    expect(msg).toContain("Codex Windows 冻结问题");
  });

  it("displays toolStatus from personal-digest.json", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).toContain("主力工具状态");
    expect(msg).toContain("codex");
    expect(msg).toContain("Windows 冻结问题仍未解决");
    expect(msg).toContain("claude-code");
    expect(msg).toContain("新增记忆功能，建议升级");
  });

  it("has exactly one report entry link", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    const reportLinkPattern = new RegExp(
      `\\]\\(${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/#2026-07-27/ai-personal\\)`,
    );
    expect(msg).toMatch(reportLinkPattern);
  });

  it("does not include the old opportunity section", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    expect(msg).not.toContain("值得关注的机会");
    expect(msg).not.toContain("今日一句话");
  });

  it("works without personalDigest (null)", () => {
    const msg = buildFeishuMessage("2026-03-09", ["ai-cli"], BASE_URL, null);
    expect(msg).toContain("AI CLI 工具");
    expect(msg).not.toContain("五分钟概览");
  });
});

// ---------------------------------------------------------------------------
// Notification dedup
// ---------------------------------------------------------------------------

describe("makeSendKey", () => {
  it("creates a key from type and date", () => {
    expect(makeSendKey("daily", "2026-07-27")).toBe("daily:2026-07-27");
  });

  it("distinguishes report types", () => {
    expect(makeSendKey("daily", "2026-07-27")).not.toBe(makeSendKey("weekly", "2026-07-27"));
  });

  it("distinguishes dates", () => {
    expect(makeSendKey("daily", "2026-07-27")).not.toBe(makeSendKey("daily", "2026-07-28"));
  });
});

// ---------------------------------------------------------------------------
// checkReportPublished — pre-send publication verification
// ---------------------------------------------------------------------------

describe("checkReportPublished", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns null when manifest contains date and md returns 200", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes("personal-digest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ generatedAt: "2026-07-27T08:00:00Z" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T08:00:00Z",
      1,
      0,
    );
    expect(result).toBeNull();
  });

  it("returns error when manifest does not contain the date", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-26", reports: ["ai-personal"] }] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T08:00:00Z",
      1,
      0,
    );
    expect(result).toContain("不包含 2026-07-27");
  });

  it("returns error when manifest date lacks ai-personal", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-cli"] }] }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T08:00:00Z",
      1,
      0,
    );
    expect(result).toContain("不包含 ai-personal");
  });

  it("returns error when ai-personal.md returns non-200", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T08:00:00Z",
      1,
      0,
    );
    expect(result).toContain("ai-personal.md");
    expect(result).toContain("404");
  });

  it("returns error when manifest fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T08:00:00Z",
      1,
      0,
    );
    expect(result).toContain("异常");
  });

  it("retries on failure and succeeds on second attempt", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes("manifest.json")) {
        if (callCount <= 2) return Promise.resolve({ ok: false, status: 404 });
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) {
        return Promise.resolve({ ok: true });
      }
      if (url.includes("personal-digest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ generatedAt: "2026-07-27T08:00:00Z" }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await checkReportPublished(
      "https://example.com/pages",
      "2026-07-27",
      "2026-07-27T08:00:00Z",
      3,
      0,
    );
    expect(result).toBeNull();
  });

  it("fails when remote generatedAt does not match expected", async () => {
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
    expect(result).toContain("generatedAt");
    expect(result).toContain("不一致");
  });

  it("succeeds when remote generatedAt matches expected", async () => {
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

  it("fails when remote personal-digest.json has no generatedAt", async () => {
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
          json: () => Promise.resolve({ toolStatus: {} }),
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
    expect(result).toContain("缺少 generatedAt");
  });

  it("retries and succeeds when generatedAt becomes correct", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("manifest.json")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ dates: [{ date: "2026-07-27", reports: ["ai-personal"] }] }),
        });
      }
      if (url.includes("ai-personal.md")) return Promise.resolve({ ok: true });
      if (url.includes("personal-digest.json")) {
        callCount++;
        if (callCount <= 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ generatedAt: "2026-07-27T00:00:00Z" }),
          });
        }
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
      3,
      0,
    );
    expect(result).toBeNull();
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Events structure — quick.what + quick.why rendered in message
// ---------------------------------------------------------------------------

describe("events structure", () => {
  it("renders quick.what and quick.why in the message", () => {
    const msg = buildFeishuMessage("2026-07-27", ["ai-personal"], BASE_URL, SAMPLE_DIGEST);
    // Each fiveMinuteBrief event should have title, quick.what, and quick.why
    expect(msg).toContain("Claude Code 新增长期记忆功能");
    expect(msg).toContain("新增长期记忆功能");
    expect(msg).toContain("减少重复上下文输入");
    expect(msg).toContain("→");
  });
});

// ---------------------------------------------------------------------------
// validateManifestEntry — pure, no side effects
// ---------------------------------------------------------------------------

describe("validateManifestEntry", () => {
  it("returns error when dates is null", () => {
    const result = validateManifestEntry(null, "2026-07-27");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("returns error when dates is empty array", () => {
    const result = validateManifestEntry([], "2026-07-27");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("returns error when target date not in manifest", () => {
    const dates: ManifestEntry[] = [{ date: "2026-07-26", reports: ["ai-personal"] }];
    const result = validateManifestEntry(dates, "2026-07-27");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not in manifest");
  });

  it("returns error when date exists but no ai-personal", () => {
    const dates: ManifestEntry[] = [{ date: "2026-07-27", reports: ["ai-cli"] }];
    const result = validateManifestEntry(dates, "2026-07-27");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ai-personal");
  });

  it("returns entry when date exists with ai-personal", () => {
    const dates: ManifestEntry[] = [{ date: "2026-07-27", reports: ["ai-personal", "ai-cli"] }];
    const result = validateManifestEntry(dates, "2026-07-27");
    expect(result.ok).toBe(true);
    expect(result.entry!.date).toBe("2026-07-27");
    expect(result.entry!.reports).toContain("ai-personal");
  });
});

// ---------------------------------------------------------------------------
// checkReportPublished — generatedAt fail-closed
// ---------------------------------------------------------------------------

describe("checkReportPublished — generatedAt required", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("rejects empty expectedGeneratedAt without attempting fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    const result = await checkReportPublished("https://example.com/pages", "2026-07-27", "", 1, 0);
    expect(result).not.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("rejects when remote personal-digest.json returns unparseable body", async () => {
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
// Workflow REPORT_DATE static check
// ---------------------------------------------------------------------------

describe("workflow REPORT_DATE", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  let workflowContent: string;

  try {
    workflowContent = fs.readFileSync(".github/workflows/daily-digest.yml", "utf-8");
  } catch {
    workflowContent = "";
  }

  it("uses TZ=Asia/Shanghai for date computation", () => {
    expect(workflowContent).toContain("TZ=Asia/Shanghai date +%Y-%m-%d");
  });

  it("feishu step references steps.date.outputs.REPORT_DATE", () => {
    expect(workflowContent).toContain("steps.date.outputs.REPORT_DATE");
  });

  it("does not contain UTC date -u", () => {
    expect(workflowContent).not.toContain("date -u +%Y-%m-%d");
  });

  it("does not contain the old empty schedule expression", () => {
    expect(workflowContent).not.toContain("github.event.schedule == '' && '' || ''");
  });
});

// ---------------------------------------------------------------------------
// Notification state shared module
// ---------------------------------------------------------------------------

describe("notification state module", () => {
  it("hashDestination returns consistent 12-char hash", async () => {
    const { hashDestination } = await import("../notification-state.ts");
    const h1 = hashDestination("chat-123");
    const h2 = hashDestination("chat-123");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(12);
  });

  it("hashDestination produces different hashes for different inputs", async () => {
    const { hashDestination } = await import("../notification-state.ts");
    expect(hashDestination("chat-123")).not.toBe(hashDestination("chat-456"));
  });

  it("makeNotificationKey includes channel, type, date, and hash", async () => {
    const { makeNotificationKey, hashDestination } = await import("../notification-state.ts");
    const key = makeNotificationKey("telegram", "daily", "2026-07-27", "chat-123");
    expect(key).toContain("telegram");
    expect(key).toContain("daily");
    expect(key).toContain("2026-07-27");
    expect(key).toContain(hashDestination("chat-123"));
    // Must NOT contain raw secret
    expect(key).not.toContain("chat-123");
  });

  it("makeFeishuIdempotencyKey is ≤50 chars", async () => {
    const { makeFeishuIdempotencyKey } = await import("../notification-state.ts");
    const key = makeFeishuIdempotencyKey("daily", "2026-07-27", "chat-id-12345");
    expect(key.length).toBeLessThanOrEqual(50);
    expect(key).toContain("notif-");
  });
});

// ---------------------------------------------------------------------------
// Telegram REPORT_DATE checks (in workflow)
// ---------------------------------------------------------------------------

describe("workflow — Telegram REPORT_DATE", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  let workflowContent: string;
  try {
    workflowContent = fs.readFileSync(".github/workflows/daily-digest.yml", "utf-8");
  } catch {
    workflowContent = "";
  }

  it("Telegram step has REPORT_DATE env", () => {
    // The Telegram step should have REPORT_DATE
    const telegramSection = workflowContent.split("Send Telegram")[1]?.split("Send Feishu")[0] ?? "";
    expect(telegramSection).toContain("REPORT_DATE");
  });

  it("persist step uses if: always()", () => {
    const persistSection = workflowContent.split("Persist notification state")[1] ?? "";
    expect(persistSection).toContain("always()");
  });
});
