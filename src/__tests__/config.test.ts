import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import { toRepoConfig, loadConfig } from "../config.ts";

// ---------------------------------------------------------------------------
// toRepoConfig
// ---------------------------------------------------------------------------

describe("toRepoConfig", () => {
  it("converts a basic entry", () => {
    const result = toRepoConfig({ id: "test", repo: "org/test", name: "Test" });
    expect(result).toEqual({ id: "test", repo: "org/test", name: "Test" });
  });

  it("includes paginated when true", () => {
    const result = toRepoConfig({ id: "test", repo: "org/test", name: "Test", paginated: true });
    expect(result).toEqual({ id: "test", repo: "org/test", name: "Test", paginated: true });
  });

  it("omits paginated when false", () => {
    const result = toRepoConfig({ id: "test", repo: "org/test", name: "Test", paginated: false });
    expect(result).not.toHaveProperty("paginated");
  });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe("loadConfig", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns defaults when config file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const config = loadConfig("/nonexistent/config.yml");
    expect(config.cliRepos.length).toBeGreaterThan(0);
    expect(config.skillsRepo).toBe("anthropics/skills");
    expect(config.openclaw.id).toBe("openclaw");
    expect(config.openclawPeers.length).toBeGreaterThan(0);
  });

  it("loads cli_repos from valid YAML", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(`
cli_repos:
  - id: custom
    repo: org/custom
    name: Custom Tool
skills_repo: custom/skills
`);
    const config = loadConfig("test.yml");
    expect(config.cliRepos).toHaveLength(1);
    expect(config.cliRepos[0]!.id).toBe("custom");
    expect(config.skillsRepo).toBe("custom/skills");
  });

  it("falls back to defaults for empty cli_repos", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("cli_repos: []");
    const config = loadConfig("test.yml");
    expect(config.cliRepos.length).toBeGreaterThan(0);
    expect(config.cliRepos[0]!.id).toBe("claude-code");
  });

  it("falls back to defaults for empty skills_repo", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("skills_repo: ''");
    const config = loadConfig("test.yml");
    expect(config.skillsRepo).toBe("anthropics/skills");
  });

  it("parses openclaw from YAML", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(`
openclaw:
  id: myclaw
  repo: org/myclaw
  name: MyClaw
  paginated: true
`);
    const config = loadConfig("test.yml");
    expect(config.openclaw).toEqual({ id: "myclaw", repo: "org/myclaw", name: "MyClaw", paginated: true });
  });

  it("falls back to default openclaw when incomplete", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("openclaw:\n  id: partial\n");
    const config = loadConfig("test.yml");
    expect(config.openclaw.id).toBe("openclaw"); // default
  });
});

// ---------------------------------------------------------------------------
// personalReport config
// ---------------------------------------------------------------------------

describe("personalReport config", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns defaults when config file does not exist", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const config = loadConfig("/nonexistent/config.yml");
    expect(config.personalReport.primaryTools).toEqual(["codex", "claude-code"]);
    expect(config.personalReport.overviewLimit).toBe(8);
    expect(config.personalReport.detailLimit).toBe(20);
    expect(config.personalReport.commercialMode).toBe("exceptional_only");
    expect(config.personalReport.unknownProjectContext).toBe(true);
  });

  it("loads custom personal_report from YAML", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(`
personal_report:
  primary_tools:
    - gemini-cli
  platforms:
    - linux
    - macos
  usage_context: research
  overview_limit: 5
  detail_limit: 15
  commercial_mode: never
  unknown_project_context: false
`);
    const config = loadConfig("test.yml");
    expect(config.personalReport.primaryTools).toEqual(["gemini-cli"]);
    expect(config.personalReport.platforms).toEqual(["linux", "macos"]);
    expect(config.personalReport.usageContext).toBe("research");
    expect(config.personalReport.overviewLimit).toBe(5);
    expect(config.personalReport.detailLimit).toBe(15);
    expect(config.personalReport.commercialMode).toBe("never");
    expect(config.personalReport.unknownProjectContext).toBe(false);
  });

  it("falls back to defaults for empty arrays", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(`
personal_report:
  primary_tools: []
  focus_topics: []
`);
    const config = loadConfig("test.yml");
    expect(config.personalReport.primaryTools).toEqual(["codex", "claude-code"]);
    expect(config.personalReport.focusTopics.length).toBeGreaterThan(0);
  });

  it("falls back to default commercial_mode for invalid value", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue(`
personal_report:
  commercial_mode: invalid_value
`);
    const config = loadConfig("test.yml");
    expect(config.personalReport.commercialMode).toBe("exceptional_only");
  });

  it("defaults when personal_report section is missing", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "readFileSync").mockReturnValue("cli_repos: []");
    const config = loadConfig("test.yml");
    expect(config.personalReport).toBeDefined();
    expect(config.personalReport.primaryTools).toEqual(["codex", "claude-code"]);
  });
});
