import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("site config", () => {
  const origPagesUrl = process.env["PAGES_URL"];

  afterEach(() => {
    if (origPagesUrl !== undefined) {
      process.env["PAGES_URL"] = origPagesUrl;
    } else {
      delete process.env["PAGES_URL"];
    }
  });

  it("exports PAGES_URL with correct default", async () => {
    delete process.env["PAGES_URL"];
    const { PAGES_URL } = await import("../site.ts");
    expect(PAGES_URL).toContain("1535385491.github.io");
    expect(PAGES_URL).toContain("Opportunity-Radar");
    expect(PAGES_URL).not.toContain("duanyytop");
  });

  it("PAGES_URL has no trailing slash", async () => {
    const { PAGES_URL } = await import("../site.ts");
    expect(PAGES_URL).not.toMatch(/\/$/);
  });
});

describe("index.html preview routing", () => {
  const htmlPath = path.resolve(import.meta.dirname, "../../index.html");
  let html: string;

  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    html = "";
  }

  it("preview init passes forceFocus:true to loadReport", () => {
    // Find the preview initialization block
    const previewBlock = html.match(/previewDate.*?loadReport\(previewDate[^)]*\)/s);
    expect(previewBlock).not.toBeNull();
    expect(previewBlock![0]).toContain("forceFocus: true");
  });

  it("preview init calls loadReport with ai-personal", () => {
    const previewBlock = html.match(/previewDate.*?loadReport\(previewDate[^)]*\)/s);
    expect(previewBlock).not.toBeNull();
    expect(previewBlock![0]).toContain('"ai-personal"');
  });

  it("inline JavaScript has valid syntax", () => {
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    expect(scriptMatch).not.toBeNull();
    expect(() => new Function(scriptMatch![1]!)).not.toThrow();
  });
});
