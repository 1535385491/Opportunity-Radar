/**
 * Loads and validates agents-radar configuration from config.yml.
 * Falls back to built-in defaults if the file is missing or a section is absent.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { RepoConfig } from "./github.ts";

// ---------------------------------------------------------------------------
// Personal report config
// ---------------------------------------------------------------------------

export interface PersonalReportConfig {
  primaryTools: string[];
  platforms: string[];
  usageContext: string;
  focusTopics: string[];
  excludedTopics: string[];
  secondaryTopics: string[];
  /** Whether the user uses an Anthropic Claude account. */
  usesAnthropicAccount: boolean;
  /** Whether the user subscribes to Anthropic Claude Pro/Max. */
  usesAnthropicSubscription: boolean;
  /** The actual model backend the primary tools use (e.g. "mimo", "gpt-4"). */
  modelBackend: string;
  /** Max events in the 5-minute brief (5-8). */
  fiveMinuteLimit: number;
  /** Max events in the full report (normal target and upper bound). */
  fullReportLimit: number;
  overviewLimit: number;
  detailLimit: number;
  commercialMode: "exceptional_only" | "always" | "never";
  unknownProjectContext: boolean;
}

const DEFAULT_PERSONAL_CONFIG: PersonalReportConfig = {
  primaryTools: ["codex", "claude-code"],
  platforms: ["windows"],
  usageContext: "个人项目开发、智能诊断系统和信息收集工具",
  focusTopics: [
    "RAG 与项目知识库",
    "Agent 长期记忆与状态数据库",
    "上下文工程",
    "代码库智能与 Code RAG",
    "RAG 与记忆系统评测",
    "可恢复的 Agent 工作流",
    "文档与多模态知识接入",
    "时序信号与智能诊断 AI",
    "故障案例推理与可解释诊断",
    "多模型路由与第三方 API 兼容",
    "信息收集与个性化情报管线",
    "MCP 与工具集成",
    "重大安全与可靠性风险",
  ],
  excludedTopics: [
    "活跃度、成熟度与生态健康度",
    "项目定位和市场战略",
    "社区治理与争议",
    "纯 UI 细节",
    "项目自身 CI、贡献和维护流程",
    "无实际落地的远期 RFC",
    "纯版本号",
    "常规 Claw 项目动态",
  ],
  secondaryTopics: [
    "GraphRAG 与知识图谱",
    "结构化输出与数据契约",
    "本地、隐私与离线 AI",
    "数据闭环与小样本学习",
    "Agent 可观测性与评测",
    "RAG、Agent 与 MCP 安全",
  ],
  usesAnthropicAccount: false,
  usesAnthropicSubscription: false,
  modelBackend: "mimo",
  fiveMinuteLimit: 6,
  fullReportLimit: 16,
  overviewLimit: 8,
  detailLimit: 20,
  commercialMode: "exceptional_only",
  unknownProjectContext: true,
};

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

interface RawRepoEntry {
  id: string;
  repo: string;
  name: string;
  paginated?: boolean;
}

interface RawPersonalReport {
  primary_tools?: string[];
  platforms?: string[];
  usage_context?: string;
  focus_topics?: string[];
  excluded_topics?: string[];
  secondary_topics?: string[];
  uses_anthropic_account?: boolean;
  uses_anthropic_subscription?: boolean;
  model_backend?: string;
  five_minute_limit?: number;
  full_report_limit?: number;
  overview_limit?: number;
  detail_limit?: number;
  commercial_mode?: string;
  unknown_project_context?: boolean;
}

interface RawConfig {
  cli_repos?: RawRepoEntry[];
  skills_repo?: string;
  openclaw?: RawRepoEntry;
  openclaw_peers?: RawRepoEntry[];
  personal_report?: RawPersonalReport;
}

export interface RadarConfig {
  cliRepos: RepoConfig[];
  skillsRepo: string;
  openclaw: RepoConfig;
  openclawPeers: RepoConfig[];
  personalReport: PersonalReportConfig;
}

// ---------------------------------------------------------------------------
// Defaults (mirrors the original hard-coded values)
// ---------------------------------------------------------------------------

const DEFAULT_CLI_REPOS: RepoConfig[] = [
  { id: "claude-code", repo: "anthropics/claude-code", name: "Claude Code" },
  { id: "codex", repo: "openai/codex", name: "OpenAI Codex" },
  { id: "gemini-cli", repo: "google-gemini/gemini-cli", name: "Gemini CLI" },
  { id: "copilot-cli", repo: "github/copilot-cli", name: "GitHub Copilot CLI" },
  { id: "kimi-cli", repo: "MoonshotAI/kimi-cli", name: "Kimi Code CLI" },
  { id: "opencode", repo: "anomalyco/opencode", name: "OpenCode" },
  { id: "qwen-code", repo: "QwenLM/qwen-code", name: "Qwen Code" },
];

const DEFAULT_SKILLS_REPO = "anthropics/skills";

const DEFAULT_OPENCLAW: RepoConfig = {
  id: "openclaw",
  repo: "openclaw/openclaw",
  name: "OpenClaw",
  paginated: true,
};

const DEFAULT_OPENCLAW_PEERS: RepoConfig[] = [
  { id: "nanobot", repo: "HKUDS/nanobot", name: "NanoBot", paginated: true },
  { id: "hermes-agent", repo: "nousresearch/hermes-agent", name: "Hermes Agent" },
  { id: "picoclaw", repo: "sipeed/picoclaw", name: "PicoClaw", paginated: true },
  { id: "nanoclaw", repo: "qwibitai/nanoclaw", name: "NanoClaw" },
  { id: "nullclaw", repo: "nullclaw/nullclaw", name: "NullClaw" },
  { id: "ironclaw", repo: "nearai/ironclaw", name: "IronClaw" },
  { id: "lobsterai", repo: "netease-youdao/LobsterAI", name: "LobsterAI" },
  { id: "tinyclaw", repo: "TinyAGI/tinyclaw", name: "TinyClaw" },
  { id: "copaw", repo: "agentscope-ai/CoPaw", name: "CoPaw" },
  { id: "moltis", repo: "moltis-org/moltis", name: "Moltis" },
  { id: "zeptoclaw", repo: "qhkm/zeptoclaw", name: "ZeptoClaw" },
  { id: "easyclaw", repo: "gaoyangz77/easyclaw", name: "EasyClaw" },
  { id: "zeroclaw", repo: "zeroclaw-labs/zeroclaw", name: "ZeroClaw" },
];

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export function toRepoConfig(e: RawRepoEntry): RepoConfig {
  return { id: e.id, repo: e.repo, name: e.name, ...(e.paginated ? { paginated: true } : {}) };
}

function parsePersonalReport(raw?: RawPersonalReport): PersonalReportConfig {
  if (!raw) return DEFAULT_PERSONAL_CONFIG;

  const isValidMode = (v: unknown): v is PersonalReportConfig["commercialMode"] =>
    v === "exceptional_only" || v === "always" || v === "never";

  return {
    primaryTools:
      Array.isArray(raw.primary_tools) && raw.primary_tools.length > 0
        ? raw.primary_tools
        : DEFAULT_PERSONAL_CONFIG.primaryTools,
    platforms:
      Array.isArray(raw.platforms) && raw.platforms.length > 0
        ? raw.platforms
        : DEFAULT_PERSONAL_CONFIG.platforms,
    usageContext:
      typeof raw.usage_context === "string" && raw.usage_context.trim()
        ? raw.usage_context.trim()
        : DEFAULT_PERSONAL_CONFIG.usageContext,
    focusTopics:
      Array.isArray(raw.focus_topics) && raw.focus_topics.length > 0
        ? raw.focus_topics
        : DEFAULT_PERSONAL_CONFIG.focusTopics,
    excludedTopics:
      Array.isArray(raw.excluded_topics) && raw.excluded_topics.length > 0
        ? raw.excluded_topics
        : DEFAULT_PERSONAL_CONFIG.excludedTopics,
    secondaryTopics:
      Array.isArray(raw.secondary_topics) && raw.secondary_topics.length > 0
        ? raw.secondary_topics
        : DEFAULT_PERSONAL_CONFIG.secondaryTopics,
    usesAnthropicAccount:
      typeof raw.uses_anthropic_account === "boolean"
        ? raw.uses_anthropic_account
        : DEFAULT_PERSONAL_CONFIG.usesAnthropicAccount,
    usesAnthropicSubscription:
      typeof raw.uses_anthropic_subscription === "boolean"
        ? raw.uses_anthropic_subscription
        : DEFAULT_PERSONAL_CONFIG.usesAnthropicSubscription,
    modelBackend:
      typeof raw.model_backend === "string" && raw.model_backend.trim()
        ? raw.model_backend.trim()
        : DEFAULT_PERSONAL_CONFIG.modelBackend,
    fiveMinuteLimit:
      typeof raw.five_minute_limit === "number" && raw.five_minute_limit > 0
        ? raw.five_minute_limit
        : DEFAULT_PERSONAL_CONFIG.fiveMinuteLimit,
    fullReportLimit:
      typeof raw.full_report_limit === "number" && raw.full_report_limit > 0
        ? raw.full_report_limit
        : DEFAULT_PERSONAL_CONFIG.fullReportLimit,
    overviewLimit:
      typeof raw.overview_limit === "number" && raw.overview_limit > 0
        ? raw.overview_limit
        : DEFAULT_PERSONAL_CONFIG.overviewLimit,
    detailLimit:
      typeof raw.detail_limit === "number" && raw.detail_limit > 0
        ? raw.detail_limit
        : DEFAULT_PERSONAL_CONFIG.detailLimit,
    commercialMode: isValidMode(raw.commercial_mode)
      ? raw.commercial_mode
      : DEFAULT_PERSONAL_CONFIG.commercialMode,
    unknownProjectContext:
      typeof raw.unknown_project_context === "boolean"
        ? raw.unknown_project_context
        : DEFAULT_PERSONAL_CONFIG.unknownProjectContext,
  };
}

export function loadConfig(configPath = "config.yml"): RadarConfig {
  const resolved = path.resolve(configPath);

  if (!fs.existsSync(resolved)) {
    console.log(`[config] ${configPath} not found — using built-in defaults.`);
    return {
      cliRepos: DEFAULT_CLI_REPOS,
      skillsRepo: DEFAULT_SKILLS_REPO,
      openclaw: DEFAULT_OPENCLAW,
      openclawPeers: DEFAULT_OPENCLAW_PEERS,
      personalReport: DEFAULT_PERSONAL_CONFIG,
    };
  }

  const raw = yaml.load(fs.readFileSync(resolved, "utf-8")) as RawConfig;

  const cliRepos =
    Array.isArray(raw?.cli_repos) && raw.cli_repos.length > 0
      ? raw.cli_repos.map(toRepoConfig)
      : DEFAULT_CLI_REPOS;

  const skillsRepo =
    typeof raw?.skills_repo === "string" && raw.skills_repo.trim()
      ? raw.skills_repo.trim()
      : DEFAULT_SKILLS_REPO;

  const openclaw = raw?.openclaw?.id && raw.openclaw.repo ? toRepoConfig(raw.openclaw) : DEFAULT_OPENCLAW;

  const openclawPeers =
    Array.isArray(raw?.openclaw_peers) && raw.openclaw_peers.length > 0
      ? raw.openclaw_peers.map(toRepoConfig)
      : DEFAULT_OPENCLAW_PEERS;

  const personalReport = parsePersonalReport(raw?.personal_report);

  console.log(
    `[config] Loaded from ${configPath}: ` +
      `${cliRepos.length} CLI repos, ${openclawPeers.length} OpenClaw peers`,
  );

  return { cliRepos, skillsRepo, openclaw, openclawPeers, personalReport };
}
