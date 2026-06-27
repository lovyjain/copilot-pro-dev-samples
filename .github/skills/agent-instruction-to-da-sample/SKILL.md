---
name: agent-instruction-to-da-sample
description: Convert an agent instruction from the pnp/copilot-prompts repo into a declarative agent sample (da-* folder) in pnp/copilot-pro-dev-samples. Use when asked to "convert an agent instruction", "turn a Copilot prompt into a sample", "port agent-instructions", or to migrate agent instructions from the copilot-prompts repo. Triggers on those phrases.
---

# Agent Instruction → Declarative Agent Sample

Convert an `agent-instruction` contribution from [pnp/copilot-prompts](https://github.com/pnp/copilot-prompts) (a paste-only system prompt) into a complete, compliant declarative agent sample (`da-*` folder) in this repo. Implements [issue #160](https://github.com/pnp/copilot-pro-dev-samples/issues/160).

Use `samples/da-WritingCoach/` as the structural reference and `templates/da-declarative-agent/` as the formal template. One sample = one PR (see `CONTRIBUTING.md`).

## Inputs

- The agent-instruction **folder name** under `pnp/copilot-prompts/samples/agent-instructions/<name>/` (e.g. `socratic-tutor`), OR pasted instruction text plus a title.
- Target folder name: `da-<name>` (kebab-case, no dots/periods).

## Workflow

### 1. Resolve the source

Fetch `https://raw.githubusercontent.com/pnp/copilot-prompts/main/samples/agent-instructions/<name>/readme.md`. Extract, verbatim where possible:

- **Title** (e.g. "Socratic Tutor Agent")
- **Summary / description**
- The **Instructions** system prompt — usually inside a fenced ```` ``` ```` code block under an `## Instructions` / `## Prompt` heading
- **Conversation starters** (often absent — author them in step 4)
- **Author(s)** with GitHub handle(s), from the `## Authors` section

### 2. Scaffold the folder

Create `samples/da-<name>/` mirroring `samples/da-WritingCoach/`. Copy these files unchanged (they are identical across `da-` samples):

- `.gitignore`
- `.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/settings.json`
- `env/.env.dev`
- `appPackage/color.png`, `appPackage/outline.png` (generic icons — flag as TODO for the author to brand)

### 3. Map source fields → target files

| Source field | Target |
|---|---|
| Instruction prompt | `appPackage/instruction.txt` (verbatim, light cleanup only) |
| Title | `manifest.json` `name.short`/`name.full`; `loc/manifest.en-US.json` `name.*` + `agentName`; README title; `sample.json` `title` |
| Summary | `manifest.json` `description.short`/`full`; `loc` `description.*` + `agentDescription`; `sample.json` `shortDescription`/`longDescription` |
| Conversation starters | `loc/manifest.en-US.json` `agentCSTitle1..6` / `agentCSText1..6` |
| Author(s) | README **Contributors**; `sample.json` `authors[]` |

Create these files (copy shapes from `da-WritingCoach`):

- **`appPackage/instruction.txt`** — the converted prompt.
- **`appPackage/declarativeAgent.json`** — `$schema` + `version` `v1.2`; `name`/`description` as `[[agentName]]`/`[[agentDescription]]`; `"instructions": "$[file('instruction.txt')]"`; six tokenized `conversation_starters`; minimal `capabilities` (omit, or use `WebSearch` when no tenant data source is needed; use `OneDriveAndSharePoint` / `GraphConnectors` only if the instructions rely on tenant content).
- **`appPackage/manifest.json`** — Teams `manifestVersion` `1.19`; `id` `${{TEAMS_APP_ID}}`; `name`/`description` filled; `localizationInfo.defaultLanguageFile` = `loc/manifest.en-US.json` (English-only to start; add `additionalLanguages` only if you ship more locale files); `copilotAgents.declarativeAgents` → `declarativeAgent.json`.
- **`appPackage/loc/manifest.en-US.json`** — real values for every `[[token]]` via `localizationKeys`.
- **`teamsapp.yml`** — copy from `da-WritingCoach`; set `additionalMetadata.sampleTag: pnp-copilot-pro-dev:da-<name>` and the app `name:`. **Do not commit a `projectId`** (it is generated on provision).
- **`README.md`** — base on `templates/da-declarative-agent/README-template.md`; replace every `YOUR_AGENT_FOLDER` with `da-<name>` (including the tracking image). Fill Summary, Contributors, Version history (today's date), Prerequisites, Minimal path to awesome, Features. Tracking image (markdown form): `![](https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/da-<name>)`.
- **`assets/sample.json`** — base on `templates/da-declarative-agent/assets/template-sample.json`; `name` = `pnp-copilot-pro-dev-da-<name>`; correct `url`/`downloadUrl`; `products` `["Microsoft 365 Copilot"]`; `metadata` PLATFORM/LANGUAGE + `API-PLUGIN`/`GRAPH-CONNECTOR` (`No` for instruction-only); today's `creationDateTime`/`updateDateTime`; `authors` and a `thumbnails[0].url` pointing at the screenshot.
- **`assets/<name>.png`** — screenshot. If none exists, copy `templates/da-declarative-agent/assets/pending-image.png` and flag a TODO in the README (CONTRIBUTING requires a real 1920x1080 screenshot before submission).

### 4. Handle missing fields

- **No conversation starters in source:** author 4–6 derived from the instructions / example interactions.
- **No icons / screenshot:** use the generic icons and the pending-image placeholder; flag both as TODO.

### 5. Preserve attribution

Credit the **original** instruction author (from the source `## Authors`) in both `README.md` Contributors and `sample.json` `authors`, and note that the sample was converted from `pnp/copilot-prompts`. This respects the CONTRIBUTING "rights to share" rule. Add the converter as an additional contributor.

## Checks (run before opening a PR)

Reuse the `declarative-agent-sample-review` skill's checklist, plus:

1. Folder name starts with `da-`, contains no periods.
2. Files present: `appPackage/{manifest.json,declarativeAgent.json,instruction.txt,loc/manifest.en-US.json,color.png,outline.png}`, `assets/{sample.json,*.png}`, `README.md`, `teamsapp.yml`, `.gitignore`, `.vscode/`, `env/.env.dev`.
3. All JSON parses; `declarativeAgent.json` `version` is `v1.2` and `$[file('instruction.txt')]` resolves to an existing file; every `[[token]]` in `declarativeAgent.json` has a matching `localizationKeys` entry.
4. `teamsapp.yml` has **no `projectId`**.
5. README has Contributors with real names, a Version history with a real author, and the markdown tracking image at the end; no trailing `---`.
6. `sample.json` `name` = `pnp-copilot-pro-dev-da-<name>`; `url`/`downloadUrl`/`authors` consistent with the README.
7. No `.zip` anywhere under `samples/` (the `no-zip-in-samples` workflow blocks them).

## Catalog

After adding the sample, regenerate the root `README.md` table and `.github/samples.json`:

```bash
pwsh ./.github/Generate-SampleList.ps1
```

Commit the regenerated catalog with the new sample folder. Open one PR per converted sample.
