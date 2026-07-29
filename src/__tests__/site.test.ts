import { describe, it, expect, afterEach } from "vitest";

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
    // Re-import to get the module-level value (cached by ESM, so we just check the export)
    const { PAGES_URL } = await import("../site.ts");
    // The default should point to the user's repo
    expect(PAGES_URL).toContain("1535385491.github.io");
    expect(PAGES_URL).toContain("Opportunity-Radar");
    expect(PAGES_URL).not.toContain("duanyytop");
  });

  it("PAGES_URL has no trailing slash", async () => {
    const { PAGES_URL } = await import("../site.ts");
    expect(PAGES_URL).not.toMatch(/\/$/);
  });
});
