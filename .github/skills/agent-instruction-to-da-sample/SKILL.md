---
name: agent-instruction-to-da-sample
description: Convert an agent instruction from the pnp/copilot-prompts repo into a declarative agent sample (da-* folder) in pnp/copilot-pro-dev-samples. Use when asked to "convert an agent instruction", "turn a Copilot prompt into a sample", "port agent-instructions", or to migrate agent instructions from the copilot-prompts repo. Triggers on those phrases.
---

# Agent Instruction → Declarative Agent Sample

Convert an `agent-instruction` contribution from [pnp/copilot-prompts](https://github.com/pnp/copilot-prompts) (a paste-only system prompt) into a complete, compliant declarative agent sample (`da-*` folder) in this repo. Implements [issue #160](https://github.com/pnp/copilot-pro-dev-samples/issues/160).

`samples/da-WritingCoach/` is the reference for **file structure and config only** — `manifest.json`, `declarativeAgent.json`, `teamsapp.yml`, `.vscode/`, `env/`, `.gitignore`. **Never copy its content-specific assets** (`color.png`, `outline.png`, screenshots, descriptions, instructions) — those are WritingCoach's brand, not generic. Every content artifact must come from the source agent-instruction or the rules below. One sample = one PR (see `CONTRIBUTING.md`).

## Inputs

- The agent-instruction **folder name** under `pnp/copilot-prompts/samples/agent-instructions/<name>/` (e.g. `socratic-tutor`), OR pasted instruction text plus a title.
- Target folder name: `da-<name>` (kebab-case, no dots/periods).

## Workflow

### 1. Resolve the source (download raw, do not summarize)

Download these raw files to disk and read them directly. Do NOT use a small-model "fetch & summarize" tool — it truncates instructions and drops metadata.

```bash
base=https://raw.githubusercontent.com/pnp/copilot-prompts/main/samples/agent-instructions/<name>
curl -fsSL "$base/readme.md"          -o source-readme.md
curl -fsSL "$base/assets/sample.json" -o source-sample.json   # may 404 — then fall back to the readme
```

The source `assets/sample.json` is **authoritative metadata** — reuse it rather than inventing values. It provides:

- `title`
- `shortDescription` (one concise line)
- `longDescription` (array of fuller paragraphs)
- `thumbnails[].url` — the source **screenshot** image (download it; see step 3 "Screenshot")
- `authors` — copy **verbatim** (`gitHubAccount`, `name`, exact `pictureUrl` — e.g. `https://avatars.githubusercontent.com/syam1977`; never rewrite the URL)
- `references`

From `readme.md` extract the **complete Instructions system prompt** — the entire fenced code block under `## Instructions` / `## Prompt`. See the verbatim rule in step 3.

If there is no source `sample.json`, derive `title`/descriptions from the readme and authors from its `## Authors` section.

### 2. Scaffold the folder (config files only)

Create `samples/da-<name>/` and copy ONLY these from `samples/da-WritingCoach/` (they are generic config, identical across `da-` samples):

- `.gitignore`
- `.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/settings.json`
- `env/.env.dev`

Do **not** copy `appPackage/color.png`, `appPackage/outline.png`, `assets/*.png`, `README.md`, `appPackage/instruction.txt`, or any localization values from WritingCoach. Those are handled below.

### 3. Create the content files

**Verbatim instruction rule (critical):** `appPackage/instruction.txt` must contain the **entire** system prompt — every line of the fenced code block, first to last, including all headings, numbered lists, sub-bullets, example interactions, and edge-case sections. Do NOT summarize, paraphrase, truncate, drop sections, collapse whitespace, or stop early. The only permitted change is removing the surrounding ```` ``` ```` fence markers. After writing, **verify completeness**: the first and last lines of `instruction.txt` match the first and last lines inside the source block, and the line count equals the number of lines between the fences. If not, re-extract.

**Description consistency rule (critical):** derive every description from the source's `shortDescription` + `longDescription` so they stay consistent (no mismatched/contradictory short vs long). Respect Teams manifest length limits — trim, don't invent a different topic:

| Field | Source | Max length |
|---|---|---|
| `name.short` / `name.full` | friendly agent name (drop the word "Agent") | 30 / 100 |
| `description.short` (manifest + loc + `sample.json` `shortDescription`) | source `shortDescription` | 80 |
| `description.full` (manifest + loc) and `sample.json` `longDescription` | source `longDescription` (join paragraphs) | 4000 |

The same `shortDescription` text must appear in `manifest.json`, `loc/manifest.en-US.json`, the root README table, and `sample.json`. The `longDescription`/`description.full` and the README Summary must be the **same subject** as the short one.

Files to create (copy only the JSON/yaml *shape* from `da-WritingCoach`):

- **`appPackage/instruction.txt`** — the complete, verbatim prompt.
- **`appPackage/declarativeAgent.json`** — `$schema` + `version` `v1.2`; `name`/`description` as `[[agentName]]`/`[[agentDescription]]`; `"instructions": "$[file('instruction.txt')]"`; tokenized `conversation_starters`; minimal `capabilities` (`WebSearch` when no tenant data is needed; `OneDriveAndSharePoint`/`GraphConnectors` only if the instructions rely on tenant content).
- **`appPackage/manifest.json`** — Teams `manifestVersion` `1.19`; `id` `${{TEAMS_APP_ID}}`; `name`/`description` per the table above; `localizationInfo.defaultLanguageFile` = `loc/manifest.en-US.json` (English-only to start); `copilotAgents.declarativeAgents` → `declarativeAgent.json`.
- **`appPackage/loc/manifest.en-US.json`** — real values for every `[[token]]` via `localizationKeys` (`agentName`, `agentDescription`, `agentCSTitle1..N`/`agentCSText1..N`).
- **`teamsapp.yml`** — set `additionalMetadata.sampleTag: pnp-copilot-pro-dev:da-<name>` and the app `name:`. **No `projectId`** (generated on provision).
- **`README.md`** — base on `templates/da-declarative-agent/README-template.md`; replace every `YOUR_AGENT_FOLDER` with `da-<name>` (including the tracking image). Fill Summary (from `longDescription`), Contributors, Version history (today's date), Prerequisites, Minimal path to awesome, Features. Tracking image: `![](https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/da-<name>)`.
- **`assets/sample.json`** — from `templates/da-declarative-agent/assets/template-sample.json`; `name` = `pnp-copilot-pro-dev-da-<name>`; correct `url`/`downloadUrl`; `products` `["Microsoft 365 Copilot"]` (note: the source uses `["Copilot"]` — convert to the M365 value); `metadata` PLATFORM=`Node.js`, LANGUAGE=`TypeScript`, `API-PLUGIN`/`GRAPH-CONNECTOR`=`No` for instruction-only; today's dates; `shortDescription`/`longDescription` from source; `thumbnails[0].url` → the screenshot raw URL; `authors` copied **verbatim** from source plus the converter as an extra entry, e.g.:
  ```json
  "authors": [
    { "gitHubAccount": "syam1977", "pictureUrl": "https://avatars.githubusercontent.com/syam1977", "name": "Shinichi Yamada" }
  ]
  ```

**Icons (do NOT reuse a branded sample's icons):** copy the **default Microsoft 365 Agents Toolkit icons** — `color.png` (md5 `22056b953eb3e8a2598790d3837a5df0`) and `outline.png` (md5 `fa8e16ac87439703613c7613157214bb`). A known-default source is `samples/da-resource-allocation/appPackage/`:

```bash
cp samples/da-resource-allocation/appPackage/color.png   samples/da-<name>/appPackage/color.png
cp samples/da-resource-allocation/appPackage/outline.png samples/da-<name>/appPackage/outline.png
```

Never copy icons from `da-WritingCoach` or any sample with a custom logo. Optionally note in the README that the author may replace these with branded icons.

**Screenshot:** download the source's own screenshot from the source `sample.json` `thumbnails[].url` (often `assets/demo.png`) into `samples/da-<name>/assets/<name>.png`, and point `sample.json` `thumbnails[0].url` + the README image at it:

```bash
curl -fsSL "<source thumbnail url>" -o samples/da-<name>/assets/<name>.png
```

Only if the source has **no** usable image (missing file or empty `url`) copy `templates/da-declarative-agent/assets/pending-image.png` as `assets/<name>.png` and add a README TODO to replace it with a 1920x1080 capture. Never use another sample's screenshot.

### 4. Handle missing fields

- **No conversation starters in source:** author 4–6 derived from the instructions / example interactions.
- **No icons:** use the default toolkit icons above.
- **No screenshot:** use the pending-image placeholder + README TODO.

### 5. Preserve attribution

Credit the **original** author in both `README.md` Contributors and `sample.json` `authors`, copied verbatim from the source `assets/sample.json` `authors` (or the readme `## Authors` if no sample.json). Note in the README that the sample was converted from `pnp/copilot-prompts`. Add the converter as an **additional** contributor — never overwrite or omit the original author. Render README contributors as `* [<name>](https://github.com/<gitHubAccount>)`.

## Checks (run before opening a PR)

Reuse the `declarative-agent-sample-review` skill's checklist, plus:

1. Folder name starts with `da-`, no periods.
2. Files present: `appPackage/{manifest.json,declarativeAgent.json,instruction.txt,loc/manifest.en-US.json,color.png,outline.png}`, `assets/{sample.json,<name>.png}`, `README.md`, `teamsapp.yml`, `.gitignore`, `.vscode/`, `env/.env.dev`.
3. All JSON parses; `declarativeAgent.json` `version` is `v1.2`; `$[file('instruction.txt')]` resolves; every `[[token]]` has a matching `localizationKeys` entry.
4. `teamsapp.yml` has **no `projectId`**.
5. README has Contributors with real names, a Version history with a real author, and the markdown tracking image at the end; no trailing `---`.
6. `sample.json` `name` = `pnp-copilot-pro-dev-da-<name>`; `url`/`downloadUrl` consistent with the README.
7. No `.zip` anywhere under `samples/`.
8. **Instruction completeness:** `instruction.txt` reproduces the full source prompt (first/last lines + line count match); never ends mid-section.
9. **Author fidelity:** every source author appears in `sample.json` `authors` with `gitHubAccount`, `name`, and original `pictureUrl` unchanged, and in README Contributors.
10. **No branded assets carried over:** `color.png` md5 = `22056b953eb3e8a2598790d3837a5df0` and `outline.png` md5 = `fa8e16ac87439703613c7613157214bb` (or intentional sample-specific icons), and **not** WritingCoach's (`a47041057032ae7048c99a9d6b7f9484` / `9be7968e4792088592556ee4c8ffc279`). The screenshot is the source's image or the pending-image placeholder — never another sample's screenshot.
11. **Description consistency:** the same `shortDescription` appears in `manifest.json`, `loc`, `sample.json`, and the README table; `description.short` ≤ 80 chars; `longDescription`/README Summary share the same subject as the short description.

```bash
# quick asset check
md5sum samples/da-<name>/appPackage/color.png samples/da-<name>/appPackage/outline.png
```

## Catalog

Regenerate the root `README.md` table and `.github/samples.json`:

```bash
pwsh ./.github/Generate-SampleList.ps1
```

If `pwsh` is unavailable, add the README table row and a matching `samples.json` entry by hand (one row: `| [<title>](./samples/da-<name>) | <shortDescription> | <author names> |`). Commit the catalog with the new sample folder. Open one PR per converted sample.
