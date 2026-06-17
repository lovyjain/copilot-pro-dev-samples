# Decision Memory — Custom Engine Agent for Microsoft 365

An institutional-memory agent for Microsoft 365 that remembers **why** your organization decided things, and catches new proposals that contradict standing decisions.

> Built as a **custom engine agent** with the Microsoft 365 Agents SDK and Model Context Protocol (MCP). Because it brings its own model, it runs in **Microsoft 365 Copilot Chat (free)** and **Teams** — **no Microsoft 365 Copilot license required**.

![Decision Memory agent in the Agents Playground](assets/screenshot.png)

## Summary

Organizations make thousands of decisions, but the *reasoning* evaporates: people leave, chats scroll away, and new teams re-litigate settled questions — or worse, quietly violate them. Decision Memory solves this by maintaining a searchable store of architectural decision records (ADRs) with full context and rationale, and proactively detecting conflicts when new proposals contradict standing decisions.

| Ask it... | It will... |
|---|---|
| *"Why did we choose PostgreSQL?"* | Search the decision store and answer with the original context and rationale — always citing the decision ID |
| *"We're proposing to use MongoDB for the orders service"* | Run conflict detection, find the standing decision it contradicts, and show a ⚠️ conflict warning |
| *"What's our current standard for partner APIs?"* | Follow supersession chains and present the decision currently in force |
| *"Record a decision: ..."* | Draft a new decision record and **require explicit confirmation before anything is written** |

## Tools and Frameworks

![drop](https://img.shields.io/badge/Microsoft%20365%20Agents%20SDK-latest-green.svg)
![drop](https://img.shields.io/badge/Node.js-20%2B-green.svg)
![drop](https://img.shields.io/badge/TypeScript-5.x-blue.svg)
![drop](https://img.shields.io/badge/Model%20Context%20Protocol-MCP-purple.svg)
![drop](https://img.shields.io/badge/Azure%20OpenAI-optional-orange.svg)

## Prerequisites

* [Node.js 20+](https://nodejs.org)
* [Microsoft 365 Agents Toolkit for VS Code](https://learn.microsoft.com/microsoftteams/platform/toolkit/install-teams-toolkit?tabs=vscode) *(optional — only needed for Teams/Copilot sideload)*
* A Microsoft 365 developer tenant with custom app upload enabled *(optional — only for Teams/Copilot deployment)*
* Azure OpenAI resource *(optional — agent runs fully offline without it using a built-in FakeLlm)*

## Version history

Version|Date|Author|Comments
-------|----|----|--------
1.0|June 2025|Lovy Jain|Initial release

## Disclaimer

**THIS CODE IS PROVIDED *AS IS* WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

---

## Minimal Path to Awesome

The repo runs **fully offline** — with no Azure OpenAI variables set, a deterministic `FakeLlm` drives the same multi-step tool loop.

* Clone this repository
* Navigate to the sample folder

```shell
cd samples/cea-decision-memory-js
```

* Install dependencies

```shell
npm install
```

* Run the unit tests (64 tests — no credentials needed)

```shell
npm test
```

* Run the offline end-to-end smoke test

```shell
npm run smoke
```

* Start all three processes (three terminals):

```shell
# Terminal 1 — Decision Memory MCP server on :3979
npm run dev:mcp

# Terminal 2 — Agent host on :3978
npm run dev

# Terminal 3 — Microsoft 365 Agents Playground (opens browser)
npm run playground
```

The [Agents Playground](https://learn.microsoft.com/microsoftteams/platform/toolkit/debug-your-agents-playground) emulates Teams/Copilot locally with no tenant, no Azure bot registration, and no tunnels.

### With Azure OpenAI

Set two environment variables (or put them in `env/.env.local` / `env/.env.local.user`):

```shell
export AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
export SECRET_AZURE_OPENAI_API_KEY=<key>
# Optional overrides:
export AZURE_OPENAI_DEPLOYMENT=gpt-4o-mini   # default
export AZURE_OPENAI_API_VERSION=2024-10-21   # default
```

Then start the MCP server and agent as above. The agent switches to Azure OpenAI automatically when the variables are present.

### In Microsoft 365 Copilot Chat and Teams

1. Install the [Microsoft 365 Agents Toolkit](https://learn.microsoft.com/microsoftteams/platform/toolkit/install-teams-toolkit?tabs=vscode) VS Code extension
2. Sign in to your M365 tenant
3. Run the **Local** debug profile (or `atk provision --env local`)
4. Open **Copilot Chat → Agents → Decision Memory** or chat with the bot in Teams

## Features

* **Institutional decision store** — searchable records with full context, rationale, alternatives, deciders, and date
* **Conflict detection** — two-stage pipeline: deterministic heuristics for recall + LLM judgment for precision; surfaces ⚠️ conflicts before they reach production
* **Supersession chains** — follows "superseded by" links to always show the decision currently in force
* **Explicit confirmation flow** — every write (create / status change) requires user confirmation; a dry-run validates the write before the user is even asked
* **MCP integration** — the decision store is exposed through a real Model Context Protocol server (Streamable HTTP, 6 tools at `http://localhost:3979/mcp`)
* **Dual rendering** — Adaptive Cards on capable surfaces (Agents Playground, Web Chat); Markdown fallback for M365 Copilot
* **Offline-first** — `FakeLlm` implements the full multi-step tool loop; CI runs 64 tests with zero credentials
* **Azure Storage support** — optional blob persistence for durable decisions across restarts and hosts

## Architecture

```
src/agent/      orchestrator (tool-calling loop), LLM clients, Adaptive Card + Markdown renderers, Agents SDK host
src/mcp/        MCP tools (6 decision tools), Streamable HTTP server, MCP client
src/store/      decision record schema (Zod), full-text search scoring, conflict heuristics
data/           seed decision records (fictional "Contoso Logistics")
appPackage/     Teams/M365 manifest (v1.22, custom engine agent) + icons
tests/          64 unit tests — all run with zero credentials
scripts/        offline smoke test + runtime reset utility
```

### MCP Tools

| Tool | Purpose |
|---|---|
| `search_decisions` | Ranked full-text search over decision records |
| `get_decision` | Full record by ID, including supersession links |
| `list_decisions` | Filter by area and/or status |
| `find_conflicting_decisions` | Heuristic conflict candidates for a proposal, with match reasons |
| `create_decision` | Record a new draft; rejects duplicates; supports `supersedes` link |
| `update_decision_status` | Promote draft to `accepted` or reject as `deprecated` |

<img src="https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/cea-decision-memory-js" />
