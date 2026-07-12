# OpenClaw Ecosystem Digest 2026-07-12

> Issues: 134 | PRs: 500 | Projects covered: 13 | Generated: 2026-07-12 12:24 UTC

- [OpenClaw](https://github.com/openclaw/openclaw)
- [NanoBot](https://github.com/HKUDS/nanobot)
- [Hermes Agent](https://github.com/nousresearch/hermes-agent)
- [PicoClaw](https://github.com/sipeed/picoclaw)
- [NanoClaw](https://github.com/qwibitai/nanoclaw)
- [NullClaw](https://github.com/nullclaw/nullclaw)
- [IronClaw](https://github.com/nearai/ironclaw)
- [LobsterAI](https://github.com/netease-youdao/LobsterAI)
- [TinyClaw](https://github.com/TinyAGI/tinyagi)
- [Moltis](https://github.com/moltis-org/moltis)
- [CoPaw](https://github.com/agentscope-ai/CoPaw)
- [ZeptoClaw](https://github.com/qhkm/zeptoclaw)
- [ZeroClaw](https://github.com/zeroclaw-labs/zeroclaw)

---

## OpenClaw Deep Dive

## OpenClaw Project Digest — 2026-07-12

### 1. Today's Overview
The OpenClaw project exhibits very high activity, with 134 issues and 500 pull requests updated in the last 24 hours. The volume suggests a vibrant and engaged community, though the lack of new releases indicates the current focus is on development, stabilization, and addressing backlog rather than cutting a new version. Key areas of ongoing work include critical bug fixes for data integrity and session stability, platform expansion (Linux/Windows clients), and enhancing security and reliability features like memory trust and provider fallback. Maintainer activity is evident, with several P0/P1 issues and PRs from core contributors like `steipete`.

### 2. Releases
No new releases were published in the last 24 hours.

### 3. Project Progress
Significant work was merged/closed today, primarily focusing on stability and security:
*   **Critical Data Integrity:** PR [#105358](https://github.com/openclaw/openclaw/pull/105358) was merged to restore session files after interrupted SQLite migrations, directly addressing the data corruption bug [#101290](https://github.com/openclaw/openclaw/issues/101290).
*   **Session & State Management:** Several PRs landed to cap in-memory session history ([#105339](https://github.com/openclaw/openclaw/pull/105339)), fix pre-update config snapshots ([#105279](https://github.com/openclaw/openclaw/pull/105279), [#105310](https://github.com/openclaw/openclaw/pull/105310)), and propagate abort signals to child sessions ([#105346](https://github.com/openclaw/openclaw/pull/105346)).
*   **Platform & UI Fixes:** Multiple fixes for the macOS app, Control UI, and browser automation were merged, including silencing build warnings ([#105361](https://github.com/openclaw/openclaw/pull/105361)), fixing tab focus stealing ([#105356](https://github.com/openclaw/openclaw/pull/105356)), and preserving agent file edits ([#105359](https://github.com/openclaw/openclaw/pull/105359)).
*   **Channel & Message Delivery:** Fixes were merged for Feishu message recall handling ([#102165](https://github.com/openclaw/openclaw/pull/102165)) and reconciling timed-out gateway messages to prevent duplicates ([#104632](https://github.com/openclaw/openclaw/pull/104632)).
*   **Security:** A critical privilege escalation fix ([#105128](https://github.com/openclaw/openclaw/pull/105128)) was opened to prevent cross-channel `/allowlist` writes.

### 4. Community Hot Topics
The most active discussions center on platform reach, data security, and core stability:
*   **[#75](https://github.com/openclaw/openclaw/issues/75) - Linux/Windows Clawdbot Apps:** (111 comments, 81👍) The long-standing request for desktop clients remains a top community priority, highlighting a major gap in platform support.
*   **[#7707](https://github.com/openclaw/openclaw/issues/7707) - Memory Trust Tagging by Source:** (16 comments) A sophisticated feature request reflecting growing concern over memory poisoning and the need for provenance-based security in agent memory.
*   **[#101290](https://github.com/openclaw/openclaw/issues/101290) - CLI startup preflight can corrupt live state DB:** (7 comments, P0) This high-severity regression report details repeated database corruption, causing significant user frustration and data loss risk.
*   **[#47910](https://github.com/openclaw/openclaw/issues/47910) - Provider fallback by failure class:** (8 comments, P1) A nuanced request to improve resilience by distinguishing between different types of model provider failures (auth vs. rate limit).

### 5. Bugs & Stability
Several high-severity bugs were reported or updated, impacting core reliability:
1.  **P0 / 🔥 Critical:** **[#101290](https://github.com/openclaw/openclaw/issues/101290)** - CLI startup corrupts live state database (`openclaw.sqlite`). **Fix PR exists:** [#105358](https://github.com/openclaw/openclaw/pull/105358) (merged).
2.  **P1 / 🦞 High:** **[#100153](https://github.com/openclaw/openclaw/issues/100153)** - Codex `message_tool_only` turns stop prematurely, causing task failure. **Status:** Open, needs more reports.
3.  **P1 / 🦞 High:** **[#96163](https://github.com/openclaw/openclaw/issues/96163)** - LINE audio file attachments result in 0-byte downloads and failed transcription. **Status:** Open.
4.  **P1 / 🦞 High:** **[#94939](https://github.com/openclaw/openclaw/issues/94939)** - 6.x state migration leaves channel SQLite empty, breaking proactive sends (MS Teams). **Status:** Open.
5.  **P2 / 🦞 Medium:** **[#102020](https://github.com/openclaw/openclaw/issues/102020)** - Session initialization conflict on second message across channels. **Status:** Open.
6.  **P2 / 🦪 Medium:** **[#105357](https://github.com/openclaw/openclaw/issues/105357)** - Browser screenshot incorrectly foregrounds the target tab. **Fix PR exists:** [#105356](https://github.com/openclaw/openclaw/pull/105356) (open).
7.  **P2 / Maintainer:** **[#105266](https://github.com/openclaw/openclaw/issues/105266)** - Flaky locale-rendering tests fail nondeterministically. **Status:** Open (maintainer).

### 6. Feature Requests & Roadmap Signals
User demand points toward platform maturity, safety, and advanced control:
*   **Platform Expansion:** Continued strong push for **Linux and Windows clients** ([#75](https://github.com/openclaw/openclaw/issues/75)) and support for **non-Node.js/embedded devices** ([#11676](https://github.com/openclaw/openclaw/issues/11676)).
*   **Security & Control:** High interest in **memory trust tagging** ([#7707](https://github.com/openclaw/openclaw/issues/7703)), **per-model timeouts** ([#8724](https://github.com/openclaw/openclaw/issues/8724)), **maxTurns limits** ([#9912](https://github.com/openclaw/openclaw/issues/9912)), and a **cron job hooks system** ([#9465](https://github.com/openclaw/openclaw/issues/9465)).
*   **Platform & Integration:** Requests for **Teams workspace sharing** ([#105322](https://github.com/openclaw/openclaw/issues/105322)), enhanced **Telegram/Feishu/LINE** functionality, and **Cloudflare Workers AI model selection** ([#10480](https://github.com/openclaw/openclaw/issues/10480)) signal maturation of real-world deployments.
*   **Prediction:** Given the activity, the next release will likely prioritize the critical stability fixes (especially for SQLite migration and session state), alongside incremental enhancements to channel integrations and security controls.

### 7. User Feedback Summary
Users express frustration with data loss and reliability issues, while requesting more granular control and better platform support.
*   **Pain Points:** **Database corruption** ([#101290](https://github.com/openclaw/openclaw/issues/101290)) and **session/message handling bugs** ([#100153](https://github.com/openclaw/openclaw/issues/100153), [#102020](https://github.com/openclaw/openclaw/issues/102020)) are critical pain points. The **lack of Linux/Windows apps** ([#75](https://github.com/openclaw/openclaw/issues/75)) is a persistent barrier for adoption.
*   **Use Cases:** Users are pushing OpenClaw into complex multi-channel, enterprise (Teams, Feishu), and developer (memory-augmented) workflows, exposing edge cases in security, state management, and error recovery.
*   **Satisfaction:** The high engagement on feature requests and detailed bug reports indicates a committed user base that is invested in the project's long-term success, despite current stability issues.

### 8. Backlog Watch
Several high-impact items require sustained maintainer attention:
*   **[#75](https://github.com/openclaw/openclaw/issues/75) - Linux/Windows Clients:** Open since 2026-01-01 with massive engagement (111 comments). This is a strategic gap that continues to generate community demand.
*   **[#7707](https://github.com/openclaw/openclaw/issues/7707) - Memory Trust Tagging:** A complex security feature with 16 comments, needing product and security review decisions.
*   **[#47910](https://github.com/openclaw/openclaw/issues/47910) - Provider Fallback by Failure Class:** A nuanced P1 enhancement that could significantly improve reliability but is awaiting a fix shape.
*   **Security-Labeled Items:** Issues like [#9764](https://github.com/openclaw/openclaw/issues/9764) (Google Chat OAuth), [#8972](https://github.com/openclaw/openclaw/issues/8972) (Discord allowlists), and [#7403](https://github.com/openclaw/openclaw/issues/7403) (Private Mode) are marked for security review and need resolution.

---

## Cross-Ecosystem Comparison

# Cross-Project Comparison Report: Personal AI Assistant & Agent Open-Source Ecosystem (2026-07-12)

## 1. Ecosystem Overview
The personal AI assistant and agent open-source ecosystem is in a phase of high-velocity, competitive development. Projects are rapidly iterating on core reliability, security, and platform expansion while grappling with fundamental architectural challenges like state management and provider interoperactivity. A clear divergence is emerging between "batteries-included" platform projects (e.g., OpenClaw) and more focused, lightweight frameworks (e.g., NanoBot). Community activity is high across major players, indicating robust adoption and a race to define standards for multi-channel, memory-augmented agent deployments.

## 2. Activity Comparison

| Project        | Issues Updated (24h) | PRs Updated (24h) | Release Status (24h) | Health Score (1-5)* |
|----------------|---------------------|-------------------|----------------------|---------------------|
| **OpenClaw**   | 134                 | 500               | None                 | 5                   |
| **NanoBot**    | * (Low)             | 13                | None                 | 4                   |
| **Hermes Agent** | 8                 | 50                | None                 | 4                   |
| **PicoClaw**   | 3                   | 3                 | None                 | 3                   |
| **NanoClaw**   | 0                   | 11                | None                 | 4                   |
| **LobsterAI**  | 0                   | 2                 | None                 | 2                   |
| **CoPaw**      | 21                  | 13                | None                 | 3                   |
| **ZeroClaw**   | 2                   | 50                | None                 | 4                   |
| *Others (NullClaw, TinyClaw, Moltis, ZeptoClaw)* | 0 | 0 | None | 1 |

\* Health Score is a synthetic metric based on activity volume, bug resolution, and community engagement from the digest.

## 3. OpenClaw's Position

*   **Advantages:** OpenClaw is the undisputed leader in community size and development velocity, with an order of magnitude more activity than any peer. Its technical approach is the most comprehensive, tackling enterprise-grade concerns like memory trust tagging (`#7707`), complex provider fallback (`#47910`), and deep cross-platform integration. Its issue/PR volume suggests the largest contributor and user base.
*   **Technical Differences:** While all projects address stability, OpenClaw uniquely focuses on foundational data integrity (SQLite migration fixes, `#105358`) and sophisticated security controls (`/allowlist` privilege escalation, `#105128`). Its architecture is likely the most complex, supporting numerous channels and deployment models.
*   **Community Size:** Based on issue and PR throughput, OpenClaw's active community is multiple times larger than the next closest competitors (Hermes Agent, ZeroClaw).

## 4. Shared Technical Focus Areas

*   **State & Session Stability:** A critical universal pain point.
    *   **Projects:** OpenClaw (`#101290`), Hermes Agent (`#63174`, `#63172`), CoPaw (`#5986`).
    *   **Need:** Robust recovery from corrupted databases, race conditions, and context compression to prevent data loss and agent hangs.
*   **Security & Access Control:** A maturing concern across the board.
    *   **Projects:** OpenClaw (`#105128`), NanoBot (`#4892`), NanoClaw (`#2986` - "Guard seam"), ZeroClaw (`#8918` - Slack token leak).
    *   **Need:** Centralized privilege decisions, secret management, and safe remote configuration changes.
*   **Platform & Channel Expansion:** A key driver of adoption.
    *   **Projects:** OpenClaw (`#75` - Linux/Windows), Hermes Agent (`#63177` - Windows `search_files`), PicoClaw (`#3203` - Matrix resilience).
    *   **Need:** First-class desktop clients (Windows/Linux) and production-hardened integrations for popular communication platforms (Matrix, WhatsApp, Slack, Teams).
*   **Provider Compatibility & Cost:** Growing importance with model diversity.
    *   **Projects:** NanoBot (`#2463` - local model caching), IronClaw (`#6010` - GLM-5.2 stability), ZeroClaw (`#9016` - gpt-5.6 tool calls).
    *   **Need:** Stable integration with new providers, support for local/self-hosted LLMs, and cost-saving features like prompt caching.

## 5. Differentiation Analysis

| Project         | Primary Focus                              | Target Users / Use Case                     | Architectural Differentiator                |
|-----------------|-------------------------------------------|---------------------------------------------|---------------------------------------------|
| **OpenClaw**    | Full-featured, high-reliability platform   | Enterprise, multi-channel power users       | Most comprehensive security & state mgmt.   |
| **NanoBot**     | Local-first performance & interactive UX   | Hobbyists, privacy-focused users, devs      | Focus on prompt caching for local models.   |
| **Hermes Agent**| Cross-platform stability & task management | Desktop users, complex workflow automation   | Strong TUI & session lifecycle management.  |
| **PicoClaw**    | Embedded devices & channel resilience      | IoT/RPi deployments, Matrix users           | Lightweight core, robust channel reconnect. |
| **CoPaw**       | Version upgrade smoothness & UI/UX polish  | Existing users migrating between versions   | Detailed legacy data compatibility handling. |
| **ZeroClaw**    | Multi-channel robustness & config simplicity | Ops teams managing multiple channels      | Breaking config simplification (Schema V4). |
| **NanoClaw**    | Enterprise security & operational control  | Governed environments, scheduled automation | Centralized "Guard seam" & audit logging.  |

## 6. Community Momentum & Maturity

*   **Tier 1: Rapidly Iterating / High Momentum:** **OpenClaw, ZeroClaw, Hermes Agent, CoPaw**. These projects show very high PR/issue throughput, indicating active feature development and response to community feedback. They are in a "land grab" phase for features and stability.
*   **Tier 2: Stable / Focused Development:** **NanoBot, PicoClaw, NanoClaw, LobsterAI**. These projects show lower activity but targeted development (e.g., NanoBot on architecture, NanoClaw on core security). They may be stabilizing after a burst or focusing on specific architectural goals.
*   **Tier 3: Dormant / Early Stage:** **NullClaw, TinyClaw, Moltis, ZeptoClaw**. No recorded activity suggests very low adoption, development pauses, or project inception.

## 7. Trend Signals

1.  **Stability is the New Feature:** The volume of high-severity bugs related to data corruption, session management, and silent failures indicates the ecosystem is transitioning from feature creation to hardening for production use. Users now prioritize reliability over new capabilities.
2.  **Security Moves Front and Center:** From ad-hoc fixes to architectural initiatives like OpenClaw's memory trust and NanoClaw's guard seam, security and access control are becoming core design pillars, signaling a shift towards enterprise and sensitive use cases.
3.  **Platform Fragmentation is a Key Challenge:** The persistent demand for Linux/Windows clients and the numerous bugs on specific platforms (Windows, Matrix, LINE) highlight the difficulty of achieving reliable cross-platform support in a rich desktop/web environment.
4.  **Local/Private Deployment Demands New Optimizations:** NanoBot's caching crisis (`#2463`) reveals that supporting local LLMs requires fundamental architectural adjustments, not just configuration options. This trend will grow as data sovereignty concerns increase.
5.  **Multi-Channel is the Battleground, but Fragile:** The most critical bugs often occur in channel integrations (Matrix sync, WhatsApp pairing, Feishu messages). Success here is key for real-world utility, but the complexity is a major source of instability.
6.  **Developer Experience (DX) Becomes a Differentiator:** Issues around `doctor` commands, configuration complexity (ZeroClaw's Schema V4), and tool discoverability (LobsterAI tooltips) show that developer/operator usability is now a competitive advantage.

**Conclusion for AI Agent Developers:** The ecosystem is vibrant but diverging. Choose a framework aligned with your deployment model: **OpenClaw** for comprehensive, enterprise-ready platforms; **NanoBot** for performance-focused local tools; **Hermes Agent** for cross-platform desktop use. Expect a continued industry-wide focus on **hardening session/state management, implementing robust security models, and simplifying multi-channel orchestration**. The projects that best solve these cross-cutting challenges will lead the next phase of adoption.

---

## Peer Project Reports

<details>
<summary><strong>NanoBot</strong> — <a href="https://github.com/HKUDS/nanobot">HKUDS/nanobot</a></summary>

# NanoBot Project Digest (2026-07-12)

## 1. Today's Overview
The NanoBot project shows active development with a focus on stability, security, and architectural refinements. High pull request activity (13 updated) indicates vigorous community contribution, while the resolution of critical bugs and security patches demonstrates a commitment to project health. The most prominent ongoing theme is resolving a fundamental architectural issue related to prompt caching and performance, which has significant implications for local model users.

## 2. Releases
No new releases were published in the last 24 hours.

## 3. Project Progress
Key features advanced and fixes merged/closed today include:

*   **Architecture Refactor:** PR [#4891](https://github.com/HKUDS/nanobot/pull/4891) was closed after merging its core concept into another change. It refactored runtime context injection (time, channel, etc.) to be opt-in and prefix-stable, aiming to resolve the foundational prompt caching issue.
*   **Workflow Redesign:** PR [#4844](https://github.com/HKUDS/nanobot/pull/4844) was closed after its valid refactor was accepted. It gates the "sustained goal" feature behind an explicit `/goal` command, changing the default agent behavior to be more user-interactive.
*   **Crash Prevention:** PR [#4764](https://github.com/HKUDS/nanobot/pull/4764) was merged, fixing a critical crash where MCP server reconnect logic could bring down the gateway.

## 4. Community Hot Topics
The most active discussions center on core performance and architectural pain points:

1.  **Issue [#2463](https://github.com/HKUDS/nanobot/issues/2463) (14 comments):** The most active discussion. It details a fundamental architectural conflict where the persisted conversation history differs from the exact prompt prefix sent to the model, breaking compatibility with OpenAI-style prompt caching. This is the root issue driving much of the recent work.
2.  **Issue [#4867](https://github.com/HKUDS/nanobot/issues/4867) (4 comments):** A direct follow-up to #2463, vividly describing the real-world impact: the architectural issue causes massive latency (~60 seconds) when using local models via Ollama, making it "totally unusable" for users with sufficient VRAM. This highlights the practical urgency of the problem.

**Analysis:** The community is expressing a strong need for performance optimization and reliability when using local/self-hosted LLMs. The solution requires careful architectural changes to ensure prompt stability for caching without breaking the agent's functionality.

## 5. Bugs & Stability (Ranked by Severity)
*   **Severity: High (P1) - Security**
    *   **PR [#4892](https://github.com/HKUDS/nanobot/pull/4892):** Fixes a security issue in the WebUI that could allow unintended reduction of workspace access permissions from remote sessions. A fix PR is actively being reviewed.
*   **Severity: High (P1) - Crash**
    *   **PR [#4842](https://github.com/HKUDS/nanobot/pull/4842):** Addresses a crash caused by an unhandled `asyncio.CancelledError` during MCP server shutdown. A fix PR is open.
*   **Severity: Medium (P2) - Regression**
    *   **PR [#4813](https://github.com/HKUDS/nanobot/pull/4813):** Fixes a bug where multimodal content (as lists) in messages would cause an `AttributeError` from an unconditional `.strip()` call. A fix PR is open with merge conflicts noted.

## 6. Feature Requests & Roadmap Signals
Signals from current PRs suggest focus areas for the next releases:
*   **Enhanced User Setup Experience:** PR [#4855](https://github.com/HKUDS/nanobot/pull/4855) introduces "guided setup flows" for channels like Feishu, indicating a push toward more polished, onboarding-friendly interfaces.
*   **Session-Specific Configuration:** PR [#4866](https://github.com/HKUDS/nanobot/pull/4866) aims to bind model presets to individual sessions, allowing for per-conversation model switching, a key feature for power users.
*   **Controlled Feature Rollout:** The discussion around "sustained goals" (#4879, #4844) shows a roadmap signal towards making powerful, blocking features like background goal pursuit opt-in, improving default user interaction.

## 7. User Feedback Summary
*   **Key Pain Point:** The performance degradation with local models is a major user frustration. User `The-Markitecht` in Issue #4867 explicitly states the current state is "totally unusable," emphasizing a critical gap in supporting the self-hosted/local LLM ecosystem effectively.
*   **Use Case:** There is clear demand for using NanoBot as a local assistant framework, leveraging hardware like a 32GB VRAM GPU for cost-effective and private operation.
*   **Satisfaction:** The rapid closure and merging of PRs for crashes and security issues (#4764, #4891) suggest the core team is responsive, which helps maintain community trust despite fundamental issues.

## 8. Backlog Watch
*   **Critical Architectural Issue:** Issue [#2463](https://github.com/HKUDS/nanobot/issues/2463) remains **OPEN** since March 2026. While PRs like #4891 and #4371 are addressing parts of it, this long-standing, 14-comment thread represents the project's most significant technical debt.
*   **Stale PRs with Conflicts:** Several important PRs are marked with `[conflict]`, indicating they need rebasing and maintainer attention to move forward:
    *   [#4650](https://github.com/HKUDS/nanobot/pull/4650) (Refactor: extract turn history recovery)
    *   [#4616](https://github.com/HKUDS/nanobot/pull/4616) (Fix: route subagent results)
    *   [#4371](https://github.com/HKUDS/nanobot/pull/4371) (Fix: add prompt breakpoint for caching)
    *   [#4879](https://github.com/HKUDS/nanobot/pull/4879) (Feature: gate sustained goals behind flag)

</details>

<details>
<summary><strong>Hermes Agent</strong> — <a href="https://github.com/nousresearch/hermes-agent">nousresearch/hermes-agent</a></summary>

# Hermes Agent Project Digest – 2026-07-12

---

## 1. Today's Overview

Hermes Agent shows **high development activity** with 50 pull requests updated in the last 24 hours (45 still open), indicating significant ongoing feature work and bug fixing. The project also saw 8 issues updated, with a mix of newly opened bugs and recently closed items. No new releases were published today, suggesting the team is focused on stabilization and feature integration ahead of a potential future release. The project continues to address cross-platform compatibility, session management, and core agent robustness.

## 2. Releases

No new releases were published on or around 2026-07-12.

## 3. Project Progress

Merged/closed PRs today indicate active resolution of platform-specific and session-state issues:

*   **[fix(packaging): expose web extra in uv lock](https://github.com/NousResearch/hermes-agent/pull/63172)** (Merged): Fixed a build issue where the `web` extra (FastAPI/Uvicorn) was silently dropped from the lockfile, ensuring correct packaging.
*   **[fix(gateway): close active sessions on shutdown](https://github.com/NousResearch/hermes-agent/pull/9634)** (Open, but updated): A significant fix for gateway reliability, ensuring clean session closure on shutdown to prevent orphaned states.
*   Multiple **security and hardening PRs** remain active, including [#9173](https://github.com/NousResearch/hermes-agent/pull/9173) (Codex CLI auth) and [#63175](https://github.com/NousResearch/hermes-agent/pull/63175) (OpenAI API compatibility).

## 4. Community Hot Topics

Activity is concentrated around session stability and platform-specific bugs:

*   **[PR #63174](https://github.com/NousResearch/hermes-agent/pull/63174) & [PR #63172](https://github.com/NousResearch/hermes-agent/pull/63172)** (Author: webtecnica): Both address critical **session state and process management** issues. #63174 fixes a compression lock error that could fork a session, while #63172 prevents orphaning live background sessions during pruning. This indicates a pressing need for bulletproof session lifecycle management.
*   **[Issue #38240](https://github.com/NousResearch/hermes-agent/issues/38240) (Skills Index Watchdog)**: An automated probe detecting degradation in the Skills Hub index. With 24 comments, it highlights ongoing maintenance challenges for the documentation and skills system.
*   **[Issue #63177](https://github.com/NousResearch/hermes-agent/issues/63177) (Windows Search Bug)**: A newly opened, high-priority (P2) bug about `search_files` failing on Windows with absolute paths. This underscores the continued importance of cross-platform reliability.

## 5. Bugs & Stability

Ranked by severity and impact:

1.  **P1 - Critical Session/State Bugs:**
    *   **[#63174 - Compression lock exception handler](https://github.com/NousResearch/hermes-agent/pull/63174)**: Risk of session forking. **Fix PR exists.**
    *   **[#63172 - Session pruning live process check](https://github.com/NousResearch/hermes-agent/pull/63172)**: Risk of orphaning active background tasks. **Fix PR exists.**
    *   **[#63169 - delegate_task results lost in Kanban workers](https://github.com/NousResearch/hermes-agent/issues/63169)**: Results from delegated tasks are silently lost, breaking complex workflows. **No fix PR yet.**

2.  **P2 - Platform/Functionality Bugs:**
    *   **[#63170 - TUI generating text instead of tool calls](https://github.com/NousResearch/hermes-agent/issues/63170)**: A critical usability issue in TUI mode where the agent fails to use tools correctly.
    *   **[#63177 - Windows `search_files` silent failure](https://github.com/NousResearch/hermes-agent/issues/63177)**: Core file search functionality broken on Windows with absolute paths.
    *   **[#63175 - OpenAI `codex_responses` format error](https://github.com/NousResearch/hermes-agent/pull/63175)**: Causes HTTP 400 errors in a specific API mode. **Fix PR exists.**
    *   **[#63178 - Cron no-agent failure misclassification](https://github.com/NousResearch/hermes-agent/pull/63178)**: Leads to incorrect error diagnosis. **Fix PR exists.**

3.  **P3 - Stability/Documentation:**
    *   **[#38240 - Skills index degradation](https://github.com/NousResearch/hermes-agent/issues/38240)**: Impacts discoverability of skills.
    *   **[#9581 - Null tool name in ACP events](https://github.com/NousResearch/hermes-agent/pull/9581)**: Causes malformed events. **Fix PR exists.**

## 6. Feature Requests & Roadmap Signals

Community requests point toward enhanced configurability, observability, and provider flexibility:

*   **[Issue #9644 - Provider/Model setup for Media Creation](https://github.com/NousResearch/hermes-agent/issues/9644)** (Closed, implemented on main): Users want to configure different AI providers for image/sound/video generation, similar to chat. This has been implemented, signaling a move toward multi-modal configurability.
*   **[PR #63176 - Configurable persistent memory char limit](https://github.com/NousResearch/hermes-agent/pull/63176)**: Directly addresses power-user demand for exceeding the 2.2k character memory cap.
*   **[PR #9597 - LosslessContextManager (SQLite DAG)](https://github.com/NousResearch/hermes-agent/pull/9597)**: A complex plugin for smarter context summarization and management, indicating advanced research into long-term agent memory.
*   **[PR #9596 - OpenTelemetry Observability](https://github.com/NousResearch/hermes-agent/pull/9596)** (Closed, not planned): Interest exists in deep observability, though this PR was not accepted. The underlying need for better debugging and monitoring persists.

## 7. User Feedback Summary

Users are experiencing friction primarily with **cross-platform reliability and complex task management**:

*   **Windows Users**: Facing core tool failures (`search_files`) that severely hamper usability.
*   **Advanced/Long-Session Users**: Dealing with session drift (timestamp issue #9628, now closed), and seeking greater memory capacity (#63176).
*   **Multi-Tool Workflow Users**: Encountering data loss with `delegate_task` (#63169) and cron job misreporting (#63178), creating uncertainty in automated pipelines.
*   **Platform Integrators**: Working on fixes for Feishu (card rendering) and gateway shutdown, showing the project's breadth but also integration complexity.

## 8. Backlog Watch

These items require maintainer attention due to age or importance:

*   **[Issue #9628 - Configurable timestamp prefix](https://github.com/NousResearch/hermes-agent/issues/9628)**: Closed, but the core problem of temporal drift in long sessions is a known pain point. Its closure ("implemented on main") should be verified.
*   **[PR #9602 - Propagate `model_aliases` context_length](https://github.com/NousResearch/hermes-agent/pull/9602)**: A P2 bug affecting display and compression for custom models. Open since April, awaiting review.
*   **[PR #9634 - Close sessions on gateway shutdown](https://github.com/NousResearch/hermes-agent/pull/9634)**: A critical P2 fix for gateway stability, open since April.
*   **[Issue #38240 - Skills index degradation](https://github.com/NousResearch/hermes-agent/issues/38240)**: A P3 automated probe issue open for over a month, indicating a persistent CI/docs maintenance gap.

---
**Overall Health Assessment:** Hermes Agent is in a **high-activity development phase** with strong community contribution. The project is actively shoring up core stability (sessions, errors, cross-platform) while simultaneously expanding feature sets (memory, configurability). The main risks appear to be a potential **bottleneck in reviewing/merging the large volume of open PRs**, particularly critical fixes, and ensuring robust functionality across all supported platforms (Windows, TUI, gateway integrations).

</details>

<details>
<summary><strong>PicoClaw</strong> — <a href="https://github.com/sipeed/picoclaw">sipeed/picoclaw</a></summary>

# PicoClaw Project Digest (2026-07-12)

## 1. Today's Overview
The PicoClaw project showed moderate activity on July 12, 2026, with 3 new Issues and 3 updated Pull Requests. Development focused on stabilizing core services and improving observability. A notable **stale bug report** regarding the Matrix integration's reliability continues to gather attention, highlighting a critical production issue. Meanwhile, a new bug was identified in the provider model parsing logic. On the positive side, a community contribution to enable skill toggling was successfully merged, advancing agent customization.

## 2. Releases
No new releases were published today.

## 3. Project Progress
*   **Merged PR:** [Skill enable/disable state + cron RunNow (#3249)](https://github.com/sipeed/picoclaw/pull/3249) was merged. This feature adds the ability to toggle skills on/off via the UI and pause cron jobs, enhancing operational control without requiring a restart.
*   **Open PRs in Review:**
    *   [fix(providers): capture the prompt cache token usage in Anthropic providers (#3251)](https://github.com/sipeed/picoclaw/pull/3251): Aims to improve cost observability by reporting cache usage metrics from Anthropic models.
    *   [Support agent-specific runtime overrides (#3225)](https://github.com/sipeed/picoclaw/pull/3225): An older, stale PR seeking to allow per-agent configuration overrides, indicating ongoing interest in fine-grained agent management.

## 4. Community Hot Topics
The most discussed item is **[BUG] Matrix sync loop has no reconnection logic (#3203)** ([link](https://github.com/sipeed/picoclaw/issues/3203)). This issue has garnered a reaction and comments, signaling a significant pain point for users relying on Matrix as a communication channel. The underlying need is for **production-grade resilience** in networked integrations. The sudden silence after a disruption is a critical flaw for automated agents.

## 5. Bugs & Stability
Bugs reported today, ranked by apparent severity:
1.  **Critical:** **Matrix sync silent death (#3203)** ([link](https://github.com/sipeed/picoclaw/issues/3203)). Causes the agent to become unreachable via Matrix without proper failure detection. **No fix PR is linked yet.** This poses a risk to system availability.
2.  **Medium:** **splitKnownProviderModel prefix stripping (#3252)** ([link](https://github.com/sipeed/picoclaw/issues/3252)). A logic bug in provider configuration that could lead to model routing failures. **No fix PR is linked yet.**

## 6. Feature Requests & Roadmap Signals
*   **[Feature] 添加对于armhf设备的docker compose支持 (#3250)** ([link](https://github.com/sipeed/picoclaw/issues/3250)): Requested Docker Compose support for ARMv7 devices (e.g., Raspberry Pi). This was **closed** (likely as out-of-scope or superseded), but it signals demand for wider hardware accessibility, aligning with the "Pico" ethos of lightweight deployment.
*   The **Agent-specific runtime overrides (#3225)** PR, though stale, suggests a roadmap signal toward greater configuration flexibility per agent, which may be prioritized for a future release.

## 7. User Feedback Summary
The primary user feedback today revolves around **operational reliability**. The Matrix sync bug (#3203) represents a fundamental frustration: an agent that appears alive but is functionally dead, undermining trust in the system's autonomy. The ARM Docker request, though closed, points to a user base eager to run PicoClaw on low-power, accessible hardware, emphasizing simplicity and broad compatibility.

## 8. Backlog Watch
*   **PR [#3225 - Support agent-specific runtime overrides](https://github.com/sipeed/picoclaw/pull/3225):** Created on July 4th and marked as **[stale]**. This feature enhancement appears to have stalled and may require maintainer review to move forward.
*   **Issue [#3203 - Matrix sync loop](https://github.com/sipeed/picoclaw/issues/3203):** This high-severity bug has been open for 10 days. Its resolution is likely a priority for users relying on Matrix, and the lack of a linked fix PR makes it a key item for maintainer attention.

---
**Health Assessment:** The project shows active community engagement in both reporting issues and contributing features. The quick closure of the ARM Docker request and the successful merge of the skill toggle feature demonstrate responsive maintainers. The primary area of concern is the unresolved, high-impact **Matrix stability bug**, which should be prioritized to maintain user confidence in the platform's core communication functions.

</details>

<details>
<summary><strong>NanoClaw</strong> — <a href="https://github.com/qwibitai/nanoclaw">qwibitai/nanoclaw</a></summary>

# NanoClaw Project Digest (2026-07-12)

## 1. Today's Overview
NanoClaw exhibits a high level of focused internal development with **11 Pull Requests (PRs) active in the last 24 hours**, all initiated by the core team or trusted contributors. There are **no open or closed issues**, suggesting either high stability or a development cycle currently concentrated on feature implementation and hardening rather than user-reported problems. The absence of new releases indicates work is in-progress toward a future version. The project health appears strong, with active engagement on foundational architecture, feature expansion, and stability fixes.

## 2. Releases
No new releases were published on 2026-07-12.

## 3. Project Progress
Development progressed primarily through the advancement of core features and fixes via PRs:
- **Merged/Closed PRs:**
    - **#2724** (Closed): An older PR from `Pineacles` was finally closed.
    - **#2952** (Closed): The "Skill/add opencode stack" PR by `javexed` was closed, indicating this proposed feature was not merged at this time.

- **Key Features in Progress:**
    - **Security & Guardrails:** PR **#2986** advances the critical "Guard seam" for centralizing privilege decisions, and **#2987** adds an opt-in local audit log skill.
    - **Task System:** PR **#3022** introduces support for defining scheduled tasks in agent templates, streamlining setup.
    - **WhatsApp Integration:** PR **#3021** adds a user warning when connecting a shared number, addressing an operational risk.
    - **Harness Configuration:** PR **#2983** implements per-group capability toggles, allowing finer-grained control over the agent environment.

## 4. Community Hot Topics
There are no open community issues, so all current activity is PR-driven. The most significant discussions are within PRs from the core team, focusing on systemic improvements:
- **PR #2986: Guard seam (Phase 2)**: This represents a major architectural effort to create a single, authoritative decision point for all privileged actions (`allow | hold | deny`), solving previous ad-hoc gating. Its central importance to security and stability makes it a key project focal point.
- **PR #3021: WhatsApp shared number warning**: Highlights a real-world operational pain point where users may inadvertently suspend service by sharing a personal number. This is a direct response to a user protection need.

## 5. Bugs & Stability
Several PRs target stability and correctness, ranked by potential impact:
1.  **Critical (System Reliability):** **PR #3019** - Addresses a severe bug where agents could hang indefinitely on tool calls, causing host-enforced container kills after 30 minutes. A "stall watchdog" is proposed as a fix.
2.  **High (Message Delivery):** **PR #3020** - Fixes a bug where agent replies could be silently dropped if the model failed to use a required message wrapper, impacting core communication functionality.
3.  **Medium (Toolchain Integrity):** **PR #2982** - Reconciles the agent-runner's tool allowlist with the actual tools available in the pinned Claude CLI version, preventing potential runtime errors from referencing non-existent tools.

## 6. Feature Requests & Roadmap Signals
PRs signal a clear roadmap focused on enterprise-readiness, operational maturity, and template extensibility:
- **Scheduled Task Automation:** The merge of PRs for task delivery (#2988) and the new proposal for template-defined scheduled tasks (**#3022**) strongly indicate that a robust, configurable scheduling system is a near-term priority.
- **Enhanced Security & Compliance:** The "Guard seam" (**#2986**) and opt-in audit logging (**#2987**) point toward a push for features necessary for governed or sensitive deployments.
- **Operational Safeguards:** The WhatsApp warning (**#3021**) and harness capability toggles (**#2983**) show a focus on improving deployment safety and configurability for different group policies.

## 7. User Feedback Summary
There are **no open issues** in the repository, which could indicate high user satisfaction, but might also reflect a period where user feedback is being gathered or channeled elsewhere (e.g., Discord, direct contact). The only direct signal of user pain points comes from the **core team's own PRs**, which proactively address risks (shared number suspension) and reliability issues (undelivered messages, hung tools). This suggests the team is internally aware of and addressing operational friction points before they escalate into a large volume of public issues.

## 8. Backlog Watch
The absence of any open issues is notable. This could mask a backlog or indicate a healthy triage process. Key items requiring attention are not in the issue tracker but are reflected in the long-lived PRs:
- **PR #2724** remained open for over a month before being closed today, potentially indicating stalled reviews.
- The foundational **"Guard seam" (PR #2986)** and **"Tasks: one-door delivery" (PR #2988)** are critical infrastructure PRs that likely need careful review and timely integration to unblock further feature work in the scheduled tasks train.

</details>

<details>
<summary><strong>NullClaw</strong> — <a href="https://github.com/nullclaw/nullclaw">nullclaw/nullclaw</a></summary>

No activity in the last 24 hours.

</details>

<details>
<summary><strong>IronClaw</strong> — <a href="https://github.com/nearai/ironclaw">nearai/ironclaw</a></summary>

# IronClaw Project Digest – 2026-07-12

## 1. Today's Overview
IronClaw saw exceptionally high activity today, driven by a massive surge in pull request throughput. While no new releases were cut, the project processed **43 merged/closed PRs** against 7 new opens, indicating either a focused push to land planned features or a consolidation phase. The issue tracker remained stable with only 3 updates, two of which were bugs reported and closed the same day. Daily benchmark tracking continues via automated issue reporting. Overall, the project demonstrates robust maintenance velocity and active investment in both stability and feature expansion.

## 2. Releases
No new releases were published on 2026-07-12.

## 3. Project Progress
Significant architectural and feature work was consolidated today, as evidenced by the closure of **43 pull requests**. Key areas of advancement include:
- **Infrastructure & Ecosystem:** New integration with JMT x402 paid API endpoints ([PR #5903](https://github.com/nearai/ironclaw/pull/5903)).
- **Channel Expansion:** Completion of WASM channel support for Prismer Cloud IM ([PR #1120](https://github.com/nearai/ironclaw/pull/1120)) and Nostr ([PR #2865](https://github.com/nearai/ironclaw/pull/2865)).
- **Agent Core:** Major updates to routine engine resilience, including injection of routine results into the agent loop ([PR #2046](https://github.com/nearai/ironclaw/pull/2046)), safety-net broadcasts for worker jobs ([PR #2119](https://github.com/nearai/ironclaw/pull/2119)), and cleanup of orphaned routine runs ([PR #2658](https://github.com/nearai/ironclaw/pull/2658)).
- **Web Frontend:** Delivery of an i18n framework with Traditional Chinese ([PR #1238](https://github.com/nearai/ironclaw/pull/1238)), UI controls for stopping active turns ([PR #2122](https://github.com/nearai/ironclaw/pull/2122)), and expanded settings for model routing ([PR #1491](https://github.com/nearai/ironclaw/pull/1491)).
- **LLM Integration:** Fixes and features for Gemini compatibility, including thought signature preservation ([PR #1588](https://github.com/nearai/ironclaw/pull/1588)), support for legacy public APIs ([PR #2319](https://github.com/nearai/ironclaw/pull/2319)), and token-level streaming ([PR #1939](https://github.com/nearai/ironclaw/pull/1939)). Prompt caching for Bedrock was also advanced ([PR #1935](https://github.com/nearai/ironclaw/pull/1935)).

## 4. Community Hot Topics
Activity today was dominated by PR throughput rather than highly commented individual threads. No issues or PRs from today's snapshot accumulated significant comments or reactions.
- **Underlying Signal:** The nature of merged PRs (e.g., JMT x402, Nostr, Prismer) indicates a strong community and contributor focus on **expanding the platform's interoperability** with external services, decentralized protocols, and diverse communication channels.

## 5. Bugs & Stability
Two bug reports were filed and closed today, demonstrating rapid triage:
1.  **[OPEN/CLOSED] Issue #6010 - High Severity (P1):** [NEAR AI inference (GLM-5.2) hangs](https://github.com/nearai/ironclaw/issues/6010) during `opencode` usage, making real-time interaction unusable. This points to potential stability issues with specific backend model integrations under load. *Closed same day, likely a fix or config adjustment was applied.*
2.  **[CLOSED] Issue #6009 - Medium Severity (P2):** [GLM-5.2 not in default model list](https://github.com/nearai/ironclaw/issues/6009) for `opencode`, requiring manual forking and configuration. This is a usability/developer experience issue. *Closed same day.*

No crash or regression reports were noted. The rapid closure of bugs suggests effective maintainership.

## 6. Feature Requests & Roadmap Signals
While no new feature requests were formally opened today, the actively developed open PRs signal clear roadmap directions:
- **API & Admin Expansion:** PR [#4264](https://github.com/nearai/ironclaw/pull/4264) (open) adds a web endpoint for routine creation, indicating ongoing work to mature the Gateway's REST API for management tasks.
- **Performance & Cost Optimization:** PR [#1935](https://github.com/nearai/ironclaw/pull/1935) (open) for Bedrock prompt caching points to a focus on reducing LLM inference costs and latency.
- **Provider Broadening:** Recent merges for Aliyun and Gemini embeddings suggest a strategic push to support a wider array of cloud and model providers.

## 7. User Feedback Summary
Today's direct user feedback, captured in issues, highlights two pain points:
- **Model Reliability:** Users experienced severe hanging with the GLM-5.2 model via the NEAR AI API, critical for developers using IronClaw as a coding assistant (`opencode`). This underscores the need for rigorous provider-specific stability testing.
- **Integration Friction:** The manual effort required to add a new model (GLM-5.2) to development tooling indicates a gap in seamless model discovery and configuration, pointing to a need for better default configurations or onboarding guides.

## 8. Backlog Watch
The provided data snapshot does not surface long-unanswered issues or PRs requiring immediate maintainer attention. The project appears to be processing its queue effectively, as shown by the closure of **43 PRs** today. Ongoing monitoring is recommended for the two still-open PRs (#4264, #1935) to ensure they continue to progress.

</details>

<details>
<summary><strong>LobsterAI</strong> — <a href="https://github.com/netease-youdao/LobsterAI">netease-youdao/LobsterAI</a></summary>

# LobsterAI Project Digest (2026-07-12)

## 1. Today's Overview
The LobsterAI project shows low activity for the period, with **no new issues reported or resolved**. Development activity was limited to **two pull request updates**: one minor UI improvement PR was opened, and one agent ID generation fix was closed. The project appears to be in a stable maintenance phase with no new releases, indicating a potential focus on internal refactoring or longer-term feature development rather than rapid iteration.

## 2. Releases
No new releases were published for this period.

## 3. Project Progress
- **Merged/Closed PR**: **[#2065](https://github.com/netease-youdao/LobsterAI/pull/2065)** was closed. This PR aimed to fix a significant data integrity issue by replacing name-based Agent ID generation with short UUIDs. The core fix was likely merged or implemented through other means, resolving the "data resurrection" problem where deleting and recreating an Agent with the same name could unexpectedly restore old session data. The PR also highlighted lingering issues with incomplete data cleanup upon Agent deletion, marking a follow-up task for maintainers.

## 4. Community Hot Topics
The most active item is the newly opened PR **[#1325](https://github.com/netease-youdao/LobsterAI/pull/1325)**, which addresses a **user experience gap**. It proposes adding tooltip hints (`title` attribute) to the "New Conversation" icon button when the sidebar is collapsed. This reflects a need for **improved discoverability and usability** of core features, especially in different UI states (collapsed sidebar, different views).

## 5. Bugs & Stability
No critical bugs or crashes were reported in Issues today. However, the context from **PR #2065** reveals a significant historical **stability/data integrity bug**: the potential for **"data resurrection"** due to deterministic, name-based Agent IDs. This could lead to user confusion and data corruption. The fix appears to be in place, but the PR also exposes a related **incomplete bug (data not cleaned on Agent deletion)** that likely still exists and requires future resolution.

## 6. Feature Requests & Roadmap Signals
Based on the PR activity, two potential roadmap signals emerge:
1. **UI/UX Polish**: The focus on adding tooltips ([PR #1325](https://github.com/netease-youdao/LobsterAI/pull/1325)) suggests ongoing attention to interface refinement and accessibility, which may continue in future releases.
2. **Agent Lifecycle Management**: The closure of PR #2065 indicates the team is actively addressing backend data management around Agents. The linked issue of incomplete data cleanup is a clear signal that **more robust Agent creation, updating, and deletion workflows** are needed and could be a focus for upcoming development.

## 7. User Feedback Summary
Direct user feedback (via Issues) is absent in this period. However, the very existence of **PR #1325** is a form of user feedback, highlighting a **pain point with button discoverability** in the collapsed sidebar mode. The work on Agent IDs also indirectly addresses user-reported or anticipated **confusion from unexpected data behavior**, pointing to a need for more reliable and predictable system state management.

## 8. Backlog Watch
Both active PRs are marked with the **`stale`** label, indicating they have been inactive for some time and require maintainer attention to avoid being closed automatically:
- **[#1325](https://github.com/netease-youdao/LobsterAI/pull/1325)** (OPEN, stale): A low-risk, high-UX-value improvement. Needs review and merge decision.
- **[#2065](https://github.com/netease-youdao/LobsterAI/pull/2065)** (CLOSED, stale): While closed, the core issue it addresses may have been resolved. However, the **follow-up task mentioned in its description (incomplete data cleanup on Agent deletion)** is a significant unresolved item that should be tracked as a separate issue or backlog item for maintainers.

</details>

<details>
<summary><strong>TinyClaw</strong> — <a href="https://github.com/TinyAGI/tinyagi">TinyAGI/tinyagi</a></summary>

No activity in the last 24 hours.

</details>

<details>
<summary><strong>Moltis</strong> — <a href="https://github.com/moltis-org/moltis">moltis-org/moltis</a></summary>

No activity in the last 24 hours.

</details>

<details>
<summary><strong>CoPaw</strong> — <a href="https://github.com/agentscope-ai/CoPaw">agentscope-ai/CoPaw</a></summary>

# CoPaw Project Digest: 2026-07-12

## 1. Today's Overview
The CoPaw project is experiencing a period of high post-release activity and stabilization following the recent v2.0.0 launch. The repository is very active, with 21 Issues and 13 Pull Requests updated in the last 24 hours, indicating intense user engagement and developer response. The activity is dominated by bug reports and fixes, suggesting a phase where the community is actively testing the new major release and identifying regression and compatibility issues. While the volume of open bug reports is high, the simultaneous submission of multiple fix PRs demonstrates a healthy, responsive development cycle.

## 2. Releases
No new releases were published in the last 24 hours.

## 3. Project Progress
Several Pull Requests were merged or closed today, advancing stability and UI polish:
*   **Bug Fixes (UI/UX):** Multiple iterations of PRs to fix dark mode text contrast in the console (e.g., PRs #5970, #5971, #5973, #5974) were closed, with an improved version (#5975) now open for review.
*   **Compatibility Fixes:** PRs addressing the handling of legacy 'file' block types during the 1.x to 2.0 message deserialization process were submitted and closed (#5988, #5990), with a new version open (#5991). This directly tackles data migration issues reported from v1.x.
*   **Core Logic Fixes:** A PR (#5987) was closed, likely superseded by a more comprehensive solution (#5989) for sanitizing orphaned `tool_result` messages after context compression.

## 4. Community Hot Topics
The most active discussions revolve around system stability and new feature requests:
1.  **Context Compression & Tool Pairing:** The most discussed issue is the breakage of `tool_call`/`tool_result` pairing after context compression, leading to API errors ([Issue #5986](https://github.com/agentscope-ai/QwenPaw/issues/5986), 4 comments). This is a critical stability concern for long-running sessions and has spawned related fixes (#5989, #5987).
2.  **Feature Request - Enhanced Channel Output:** A feature request to separately control and truncate tool call results sent to messaging channels (Feishu, DingTalk) highlights a need for more flexible output management in integrations ([Issue #5976](https://github.com/agentscope-ai/QwenPaw/issues/5976)).
3.  **Legacy Data Compatibility:** The problem of Pydantic errors when parsing old memory states after upgrading to v2.0.0 ([Issue #5967](https://github.com/agentscope-ai/QwenPaw/issues/5967)) and missing SSH Offline/Profiles features returning 404 ([Issue #5980](https://github.com/agentscope-ai/QwenPaw/issues/5980)) underscore significant migration challenges for existing users.

## 5. Bugs & Stability
Bugs reported today, ranked by apparent severity:
1.  **HIGH - Systemic API Errors:** Multiple reports of `400 BadRequestError` due to orphaned `tool_result` messages or broken message sequences ([#5986](https://github.com/agentscope-ai/QwenPaw/issues/5986), [#5985](https://github.com/agentscope-ai/QwenPaw/issues/5985), [#5972](https://github.com/agentscope-ai/QwenPaw/issues/5972)). Fix PRs are actively being worked on (#5989, #5987).
2.  **MEDIUM - Functional Regressions:** Key features from v1.x are broken, such as auto-memory summarization ([#5952](https://github.com/agentscope-ai/QwenPaw/issues/5952), [#5978](https://github.com/agentscope-ai/QwenPaw/issues/5978)) and the `qwenpaw doctor` health check ([#5983](https://github.com/agentscope-ai/QwenPaw/issues/5983)). The shell command requiring repeated user approval is also a significant workflow disruption ([#5982](https://github.com/agentscope-ai/QwenPaw/issues/5982)).
3.  **MEDIUM - UI/UX Defects:** Dark mode contrast issues ([#5969](https://github.com/agentscope-ai/QwenPaw/issues/5969)) and the skills page scroll-to-load failure ([#5788](https://github.com/agentscope-ai/QwenPaw/issues/5788)) degrade user experience. Fix PRs are in progress (#5975, #5968).
4.  **LOW - Edge Case Issues:** Problems with the search field auto-fill ([#5981](https://github.com/agentscope-ai/QwenPaw/issues/5981)) and plugin route loss after hot-reload ([#5977](https://github.com/agentscope-ai/QwenPaw/issues/5977)) are notable but likely affect fewer users.

## 6. Feature Requests & Roadmap Signals
User feedback points toward desired enhancements:
*   **Authentication:** A request for OAuth login support for OpenAI/Codex services ([#4124](https://github.com/agentscope-ai/QwenPaw/issues/4124)) suggests a desire for broader provider integration.
*   **Developer Tools & Flexibility:** The feature request to split tool call parameters and results ([#5976](https://github.com/agentscope-ai/QwenPaw/issues/5976)) and the question about using AgentScope's permission controls in QwenPaw ([#5958](https://github.com/agentscope-ai/QwenPaw/issues/5958)) indicate power-user needs for fine-grained control and security.
*   **Platform Support:** The continued question about Intel Mac support ([#2664](https://github.com/agentscope-ai/QwenPaw/issues/2664)) signals an unresolved segment of the user base.

## 7. User Feedback Summary
User sentiment is a mix of engagement with the new version and frustration with upgrade pain points. Key pain points are:
1.  **Upgrade Instability:** Users upgrading from v1.x to v2.0.0 are encountering broken features and data compatibility issues (#5967, #5980), creating a frustrating out-of-box experience.
2.  **Core System Reliability:** The context compression and session management bugs (#5986, #5972) undermine the reliability of core agent functionality, which is critical for long-running or complex tasks.
3.  **UI Usability Issues:** Problems like unreadable dark mode text and non-functional scroll pagination directly impact daily usability (#5969, #5788).
4.  **Positive Signal:** The volume of detailed bug reports with logs and the submission of community PRs (#5791, #5869, #5968) show a committed user base willing to contribute to fixes.

## 8. Backlog Watch
Two long-standing issues require maintainer attention:
*   **OAuth Login Request:** [Issue #4124](https://github.com/agentscope-ai/QwenPaw/issues/4124) has been open since May 8, 2026, without a definitive response on roadmap inclusion.
*   **Intel Mac Support Query:** [Issue #2664](https://github.com/agentscope-ai/QwenPaw/issues/2664) has been open since March 31, 2026, indicating an unanswered platform support question.
These issues are at risk of becoming stale and may reflect unaddressed user segments or feature priorities.

</details>

<details>
<summary><strong>ZeptoClaw</strong> — <a href="https://github.com/qhkm/zeptoclaw">qhkm/zeptoclaw</a></summary>

No activity in the last 24 hours.

</details>

<details>
<summary><strong>ZeroClaw</strong> — <a href="https://github.com/zeroclaw-labs/zeroclaw">zeroclaw-labs/zeroclaw</a></summary>

# ZeroClaw Project Digest (2026-07-12)

## 1. Today's Overview
Project activity is high, with 50 open Pull Requests and 2 new Issues updated in the last 24 hours. The high PR volume, with none merged, suggests a significant burst of development work, particularly on channel integrations (WhatsApp, Lark, Slack), core runtime fixes, and configuration refactoring. No new releases were cut, indicating that the current codebase is in an active integration and review phase. The overall health appears robust, with focused efforts on improving provider stability, diagnostic tooling, and multi-channel robustness.

## 2. Releases
No new releases were published in the last 24 hours. The absence of a release, combined with the high volume of open PRs, suggests that a new version is likely being prepared and may incorporate the many pending changes.

## 3. Project Progress
No PRs were merged or closed today, meaning no features or fixes were formally integrated into the main branch. However, the 50 open PRs represent substantial progress on multiple fronts. Key areas of active development include:
*   **Channel & Gateway Hardening:** Several large PRs (`#8732`, `#8734`, `#8622`, `#8735`) advance QR-pairing channel (WhatsApp Web, WeChat) readiness reporting, relink mechanisms, and structured login events, moving towards more resilient and observable headless deployments.
*   **Core Runtime & Diagnostics:** PRs like `#8961`, `#8910`, and `#8836` aim to make the `doctor` command more robust by adding timeouts and displaying partial results.
*   **Tool & Provider Stability:** `#8890` enhances web search error reporting, while `#8931` and `#8927` address critical provider compatibility and tool argument sanitization issues.

## 4. Community Hot Topics
Activity is concentrated on PRs awaiting author or maintainer action, indicating a backlog in the review cycle.
*   **PR #8754 [feat(config)!]** ([link](https://github.com/zeroclaw-labs/zeroclaw/pull/8754)): A large, breaking "Schema V4" configuration cut that removes retired channels and integrations. This represents a major roadmap signal for project simplification and needs careful review.
*   **PR #8655 [refactor(zerocode)]** ([link](https://github.com/zeroclaw-labs/zeroclaw/pull/8655)): A major refactor consolidating the "ZeroCode" session interface, aimed at simplifying the agent's interactive coding surface.
*   **Issue #9016 [Bug]** ([link](https://github.com/zeroclaw-labs/zeroclaw/issues/9016)): A high-severity (S1) bug where OpenAI `gpt-5.6-sol` fails with tool calls, indicating a critical compatibility issue with the latest provider capabilities.
*   **Issue #9022 [Feature]** ([link](https://github.com/zeroclaw-labs/zeroclaw/issues/9022)): A request for Slack Events API support for "scale-to-zero" deployments, reflecting a need for more efficient, cloud-native integration patterns.

## 5. Bugs & Stability
1.  **CRITICAL (S1):** **OpenAI Tool Turn Failure** ([Issue #9016](https://github.com/zeroclaw-labs/zeroclaw/issues/9016)). A workflow-blocking bug prevents tool calls when `reasoning_effort` is not `none`. No dedicated fix PR is yet visible in today's data.
2.  **HIGH:** **Provider Argument Sanitization** ([PR #8931](https://github.com/zeroclaw-labs/zeroclaw/pull/8931)) fixes a bug causing HTTP 400 errors from some providers due to malformed tool call arguments. This is a stability fix for OpenAI-compatible and routed upstreams.
3.  **MEDIUM:** **Doctor Command Hang** ([PR #8961](https://github.com/zeroclaw-labs/zeroclaw/pull/8961)) and **Silent Timeout** ([PR #8910](https://github.com/zeroclaw-labs/zeroclaw/pull/8910)) address issues where the diagnostic tool would hang or fail without output, hindering troubleshooting.
4.  **MEDIUM:** **Security: Slack Token Leak** ([PR #8918](https://github.com/zeroclaw-labs/zeroclaw/pull/8918)) addresses a gap in secret redaction for Slack tokens, a security improvement.

## 6. Feature Requests & Roadmap Signals
*   **Configuration Simplification (Schema V4):** PR [#8754](https://github.com/zeroclaw-labs/zeroclaw/pull/8754) signals a planned breaking change to remove legacy channels and integrations. This is a strong indicator of a roadmap focused on core functionality.
*   **Enhanced Channel Operations:** Requests and PRs for Slack Events API ([#9022](https://github.com/zeroclaw-labs/zeroclaw/issues/9022)), improved WhatsApp/WeChat relink procedures ([#8734](https://github.com/zeroclaw-labs/zeroclaw/pull/8734)), and Lark file handling ([#9023](https://github.com/zeroclaw-labs/zeroclaw/pull/9023)) point to a focus on making channel integrations more professional and reliable.
*   **Agent Memory & Observability:** PR [#8900](https://github.com/zeroclaw-labs/zeroclaw/pull/8900) introduces typed memory classification, and PR [#8916](https://github.com/zeroclaw-labs/zeroclaw/pull/8916) works on emitting full agent lifecycle events, showing investment in smarter, more observable agents.

## 7. User Feedback Summary
Users are reporting critical compatibility issues with cutting-edge provider features ([#9016](https://github.com/zeroclaw-labs/zeroclaw/issues/9016)) and operational pain points with diagnostic tools. There is also a clear desire for more efficient deployment models ([#9022](https://github.com/zeroclaw-labs/zeroclaw/issues/9022)) and better handling of inbound media in channels like Lark ([#9023](https://github.com/zeroclaw-labs/zeroclaw/pull/9023)). The volume of open PRs, many awaiting author updates (`needs-author-action`), suggests a fast-paced development cycle where community contributions are active but require more review bandwidth.

## 8. Backlog Watch
Several significant PRs require maintainer attention or author follow-up and have been pending for several days:
*   **PR #8655 [refactor(zerocode)]** (Opened 7 days ago, `needs-author-action`): Major UI/UX refactor.
*   **PR #8754 [feat(config)!]** (Opened 6 days ago, `needs-author-action`): Breaking configuration schema change.
*   **PR #8734 [feat(gateway)]** (Opened 7 days ago, `needs-maintainer-review`): Channel relink hook API.
*   **PR #8622 [feat(channels)]** (Opened 10 days ago, `needs-maintainer-review`): QR pairing event logging.
The high-risk (`risk:high`) and large size (`size:XL`/`L`) tags on these PRs make them critical to address to avoid blocking broader integration work.

</details>