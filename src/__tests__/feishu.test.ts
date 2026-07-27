import { describe, it, expect, afterEach } from "vitest";
import { buildFeishuMessage, makeSendKey } from "../feishu.ts";
import type { PersonalReportJson } from "../personal-report.ts";

const BASE_URL = "https://example.com/radar";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DIGEST: PersonalReportJson = {
  generatedAt: "2026-07-27T08:00:00Z",
  coverageFrom: "2026-07-23T08:00:00Z",
  coverageTo: "2026-07-27T08:00:00Z",
  overview: [
    { id: "evt-1", topic: "Claude Code 新功能", summary: "新增长期记忆功能" },
    { id: "evt-2", topic: "Codex 稳定性", summary: "Windows 冻结问题" },
  ],
  toolStatus: {
    codex: "Windows 冻结问题仍未解决",
    "claude-code": "新增记忆功能，建议升级",
  },
  topics: [
    {
      name: "主力工具更新",
      items: [
        {
          id: "evt-1",
          candidateIds: ["https://github.com/anthropics/claude-code/pull/123"],
          title: "Claude Code 新增长期记忆功能",
          eventTime: "2026-07-27T08:00:00Z",
          updateKind: "new",
          what: "新增跨会话记忆功能",
          why: "减少重复上下文输入",
          impact: "提高开发效率",
          status: "已确认",
          sources: [{ name: "GitHub", url: "https://github.com/anthropics/claude-code/pull/123" }],
        },
      ],
    },
  ],
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

  it("displays overview from personal-digest.json", () => {
    const msg = buildFeishuMessage(
      "2026-07-27",
      ["ai-personal"],
      BASE_URL,
      SAMPLE_DIGEST,
    );
    expect(msg).toContain("五分钟概览");
    expect(msg).toContain("Claude Code 新功能");
    expect(msg).toContain("新增长期记忆功能");
    expect(msg).toContain("Codex 稳定性");
  });

  it("displays toolStatus from personal-digest.json", () => {
    const msg = buildFeishuMessage(
      "2026-07-27",
      ["ai-personal"],
      BASE_URL,
      SAMPLE_DIGEST,
    );
    expect(msg).toContain("主力工具状态");
    expect(msg).toContain("codex");
    expect(msg).toContain("Windows 冻结问题仍未解决");
    expect(msg).toContain("claude-code");
    expect(msg).toContain("新增记忆功能，建议升级");
  });

  it("has exactly one report entry link", () => {
    const msg = buildFeishuMessage(
      "2026-07-27",
      ["ai-personal"],
      BASE_URL,
      SAMPLE_DIGEST,
    );
    const reportLinkPattern = new RegExp(`\\]\\(${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/#2026-07-27/ai-personal\\)`);
    expect(msg).toMatch(reportLinkPattern);
  });

  it("does not include the old opportunity section", () => {
    const msg = buildFeishuMessage(
      "2026-07-27",
      ["ai-personal"],
      BASE_URL,
      SAMPLE_DIGEST,
    );
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
