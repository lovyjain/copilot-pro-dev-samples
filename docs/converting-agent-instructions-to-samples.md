# Converting Copilot agent instructions into samples

> **Status: proposal / how-to guide.** This document describes how to take community-contributed
> agent instructions — such as the `*.agent.md`, `*.chatmode.md` and `*.prompt.md` files accepted
> by the [github/awesome-copilot](https://github.com/github/awesome-copilot) ("Copilot prompts")
> repository — and convert them into declarative agent (`da-`) samples in this repository.

## Why convert them?

The awesome-copilot repository collects reusable GitHub Copilot customizations:

| Source file type | What it contains |
|------------------|------------------|
| `*.agent.md` | A custom agent: name, description, tool list, and a Markdown body of instructions |
| `*.chatmode.md` | A chat mode: persona + instructions + tool list for VS Code Copilot Chat |
| `*.prompt.md` | A reusable, task-specific prompt |
| `*.instructions.md` | Coding standards applied automatically to matching files |

The first two are, in essence, **the same thing a Microsoft 365 Copilot declarative agent is**: a
name, a description, and a block of instructions layered on top of a foundation model. That makes
them excellent raw material for new `da-` samples — they bring a proven persona and instruction set,
and this repository adds the packaging (app manifest, agent manifest, Agents Toolkit project,
README) that lets people run them inside Microsoft 365 Copilot.

## What converts well (and what doesn't)

| Source | Converts? | Notes |
|--------|-----------|-------|
| Agents (`*.agent.md`) | ✅ Yes | Persona + instructions map 1:1 to a declarative agent manifest |
| Chat modes (`*.chatmode.md`) | ✅ Yes | Same shape as agents; ignore IDE-only tool references |
| Prompts (`*.prompt.md`) | ⚠️ Sometimes | Task-specific prompts work best folded into an agent's instructions or as conversation starters, not as standalone samples |
| Instructions (`*.instructions.md`) | ❌ Rarely | These are IDE/codebase-scoped coding standards (`applyTo` globs) with no Microsoft 365 chat surface; only convert if the content stands alone as advisory knowledge |

Pick candidates whose value is in the *instructions themselves* (coaching, reviewing, planning,
writing, explaining) rather than in IDE-side tools like editing files in a workspace, which have no
declarative agent equivalent.

## Field mapping reference

| Source (`.agent.md` / `.chatmode.md` front matter + body) | Target |
|-----------------------------------------------------------|--------|
| `name` / file name | `name` in `declarativeAgent.json`; `name.short` / `name.full` in `manifest.json` |
| `description` | `description` in `declarativeAgent.json` and `manifest.json` |
| Markdown body | `appPackage/instruction.txt`, referenced via `"instructions": "$[file('instruction.txt')]"` — **must be ≤ 8,000 characters**, so trim IDE-specific sections |
| `tools` | Nearest declarative agent [capability](https://learn.microsoft.com/microsoft-365-copilot/extensibility/agent-capabilities-overview) — see below |
| Example prompts / usage section | `conversation_starters` in `declarativeAgent.json` |

Common tool → capability mappings:

| Source tool | Declarative agent capability |
|-------------|------------------------------|
| `websearch` / `fetch` | `WebSearch` |
| Code execution / data analysis | `CodeInterpreter` |
| Image generation | `GraphicArt` |
| File/document lookup | `OneDriveAndSharePoint` |
| `editFiles`, `codebase`, `terminal`, other IDE tools | No equivalent — remove, and delete instruction text that depends on them |

Rewrite instruction passages that assume an IDE context ("the open file", "the workspace", "apply
the edit") into chat-context equivalents ("the document the user shares", "the text provided"), and
keep the persona, tone, rules, and output-format guidance intact — that is the part worth porting.

## Step-by-step conversion

1. **Pick a source and check the license.** awesome-copilot content is MIT-licensed, but you must
   still credit the original author. Link the source file in your README and list the original
   author under **Contributors**. Only submit content you have the rights to share
   (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
2. **Scaffold the sample.** Create a declarative agent project with
   [Microsoft 365 Agents Toolkit](https://learn.microsoft.com/microsoft-365-copilot/extensibility/build-declarative-agents)
   for VS Code (**Create a New Agent/App > Declarative Agent**), then copy in
   [`templates/da-declarative-agent`](../templates/da-declarative-agent) for the README and
   `sample.json` templates. Name the folder `samples/da-<kebab-case-name>` (lowercase, hyphens, no
   periods).
3. **Port the instructions.** Paste the Markdown body into `appPackage/instruction.txt`, apply the
   rewrites above, and keep it under 8,000 characters.
4. **Fill in the manifests.** Set name, description, capabilities, and 2–6 `conversation_starters`
   in `appPackage/declarativeAgent.json`; mirror name/description in `appPackage/manifest.json`.
   Use the latest schema versions (see [AGENTS.md](../AGENTS.md#schema-versions)).
5. **Set the sample metadata.** In `m365agents.yml`, add
   `additionalMetadata.sampleTag: pnp-copilot-pro-dev:da-<your-folder>` and make sure there is no
   `projectId`. Blank out generated values in `env/.env.dev` and commit no secrets, tenant IDs, or
   app IDs.
6. **Test it.** Provision with Agents Toolkit into a Microsoft 365 Copilot tenant and run the
   conversation starters. Capture at least one 1920×1080 `.png` screenshot of the agent answering
   ("pics or it didn't happen") into `assets/`.
7. **Write the README and `sample.json`.** Base them on the templates, document build/run steps,
   credit the original instruction author, and point the tracking image at
   `https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/da-<your-folder>`.
8. **Register the sample.** Add a row to the samples table in the root [README.md](../README.md).
9. **Submit.** One sample per PR, on a branch forked from `main`, following
   [CONTRIBUTING.md](../CONTRIBUTING.md).

## Worked example

A minimal `.agent.md` such as:

```markdown
---
name: Code Review Coach
description: Reviews code and teaches better patterns instead of just fixing it.
tools: ['websearch']
---

You are a patient senior engineer. When given code, never rewrite it outright.
Instead, identify up to three issues, explain why each matters, and ask a
guiding question that helps the author find the fix themselves...
```

becomes `appPackage/declarativeAgent.json`:

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json",
  "version": "v1.6",
  "name": "Code Review Coach",
  "description": "Reviews code and teaches better patterns instead of just fixing it.",
  "instructions": "$[file('instruction.txt')]",
  "capabilities": [
    { "name": "WebSearch" }
  ],
  "conversation_starters": [
    { "title": "Review my code", "text": "Review this function and coach me on improving it" },
    { "title": "Explain a pattern", "text": "Why is this pattern a problem in my code?" }
  ]
}
```

with the Markdown body (front matter removed) in `appPackage/instruction.txt`.

## Good first candidates

Prioritize sources that need no external APIs — they convert into instructions-only samples like
[`da-PositivityAgent`](../samples/da-PositivityAgent) or
[`da-geolocator-game`](../samples/da-geolocator-game) and can be tested in minutes:

* Coaching/teaching personas (prompt engineering coach, code review coach, mentoring agents)
* Planning and specification writers/reviewers
* Writing, documentation, and communication assistants
* Debugging companions and "explain this" agents

Before converting, search the [samples table](../README.md) for an existing similar sample — if one
exists, extend it instead of adding a near-duplicate.

## Submission checklist

- [ ] Original author credited and source file linked in the README
- [ ] Instructions ≤ 8,000 characters, IDE-specific content removed or rewritten
- [ ] Sample folder, README, `sample.json`, `.gitignore`, screenshot, and root README row per [AGENTS.md](../AGENTS.md)
- [ ] Latest manifest schema versions
- [ ] `sampleTag` set, no `projectId`, no secrets
- [ ] Tested in a real tenant with a screenshot to prove it
- [ ] One sample per pull request

![](https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/docs/converting-agent-instructions-to-samples.md)
