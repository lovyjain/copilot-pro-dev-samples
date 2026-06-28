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

Fetch BOTH of these raw files from the source folder (do not rely on a rendered/summarized view — always pull the raw bytes so nothing is truncated):

1. `https://raw.githubusercontent.com/pnp/copilot-prompts/main/samples/agent-instructions/<name>/readme.md`
2. `https://raw.githubusercontent.com/pnp/copilot-prompts/main/samples/agent-instructions/<name>/assets/sample.json` (may not exist for every agent — if 404, skip and fall back to parsing the readme)

> Do NOT use a small-model "fetch and summarize" tool to read the instruction or the authors. Download the raw file to disk (e.g. `curl -fsSL <url> -o source.md`) and read it directly, so the full text and exact metadata are preserved.

Extract:

- **Title** (e.g. "Socratic Tutor Agent")
- **Summary / description**
- The **complete Instructions system prompt** — the ENTIRE content of the fenced code block under the `## Instructions` / `## Prompt` heading. See step 3 for the verbatim-copy rule.
- **Conversation starters** (often absent — author them in step 4)
- **Author(s)** — take the `authors` array **verbatim** from the source `assets/sample.json` when present (preserve each object's `gitHubAccount`, `name`, and the exact `pictureUrl` as written, e.g. `https://avatars.githubusercontent.com/syam1977` — do NOT rewrite or reconstruct the URL). Only if there is no source `sample.json`, parse names/handles from the readme `## Authors` section.

### 2. Scaffold the folder

Create `samples/da-<name>/` mirroring `samples/da-WritingCoach/`. Copy these files unchanged (they are identical across `da-` samples):

- `.gitignore`
- `.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/settings.json`
- `env/.env.dev`
- `appPackage/color.png`, `appPackage/outline.png` (generic icons — flag as TODO for the author to brand)

### 3. Map source fields → target files

| Source field | Target |
|---|---|
| Instruction prompt (full) | `appPackage/instruction.txt` (COMPLETE, verbatim — see rule below) |
| Title | `manifest.json` `name.short`/`name.full`; `loc/manifest.en-US.json` `name.*` + `agentName`; README title; `sample.json` `title` |
| Summary | `manifest.json` `description.short`/`full`; `loc` `description.*` + `agentDescription`; `sample.json` `shortDescription`/`longDescription` |
| Conversation starters | `loc/manifest.en-US.json` `agentCSTitle1..6` / `agentCSText1..6` |
| `authors` (from source `sample.json`) | README **Contributors**; `sample.json` `authors[]` (copied verbatim) |

**Verbatim instruction rule (critical):** `appPackage/instruction.txt` must contain the **entire** system prompt — every line of the fenced code block, from the first line to the last, including all headings, numbered lists, sub-bullets, example interactions, and edge-case sections. Do NOT summarize, paraphrase, truncate, drop sections, collapse whitespace, or stop early. The only permitted change is removing the surrounding ```` ``` ```` fence markers themselves. After writing the file, **verify completeness**: the first and last non-fence lines of `instruction.txt` must match the first and last lines inside the source code block, and the line count must equal the number of lines between the fences. If they differ, re-extract.

Create these files (copy shapes from `da-WritingCoach`):

- **`appPackage/instruction.txt`** — the complete, verbatim prompt (see rule above).
- **`appPackage/declarativeAgent.json`** — `$schema` + `version` `v1.2`; `name`/`description` as `[[agentName]]`/`[[agentDescription]]`; `"instructions": "$[file('instruction.txt')]"`; six tokenized `conversation_starters`; minimal `capabilities` (omit, or use `WebSearch` when no tenant data source is needed; use `OneDriveAndSharePoint` / `GraphConnectors` only if the instructions rely on tenant content).
- **`appPackage/manifest.json`** — Teams `manifestVersion` `1.19`; `id` `${{TEAMS_APP_ID}}`; `name`/`description` filled; `localizationInfo.defaultLanguageFile` = `loc/manifest.en-US.json` (English-only to start; add `additionalLanguages` only if you ship more locale files); `copilotAgents.declarativeAgents` → `declarativeAgent.json`.
- **`appPackage/loc/manifest.en-US.json`** — real values for every `[[token]]` via `localizationKeys`.
- **`teamsapp.yml`** — copy from `da-WritingCoach`; set `additionalMetadata.sampleTag: pnp-copilot-pro-dev:da-<name>` and the app `name:`. **Do not commit a `projectId`** (it is generated on provision).
- **`README.md`** — base on `templates/da-declarative-agent/README-template.md`; replace every `YOUR_AGENT_FOLDER` with `da-<name>` (including the tracking image). Fill Summary, Contributors, Version history (today's date), Prerequisites, Minimal path to awesome, Features. Tracking image (markdown form): `![](https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/da-<name>)`.
- **`assets/sample.json`** — base on `templates/da-declarative-agent/assets/template-sample.json`; `name` = `pnp-copilot-pro-dev-da-<name>`; correct `url`/`downloadUrl`; `products` `["Microsoft 365 Copilot"]`; `metadata` PLATFORM/LANGUAGE + `API-PLUGIN`/`GRAPH-CONNECTOR` (`No` for instruction-only); today's `creationDateTime`/`updateDateTime`; a `thumbnails[0].url` pointing at the screenshot; and the **`authors` array copied verbatim from the source `assets/sample.json`** — keep every field intact, e.g.:
  ```json
  "authors": [
    {
      "gitHubAccount": "syam1977",
      "pictureUrl": "https://avatars.githubusercontent.com/syam1977",
      "name": "Shinichi Yamada"
    }
  ]
  ```
  Do not drop the author, change the `name`, or rewrite the `pictureUrl`. Append the converter as an additional entry only; never replace the original author.
- **`assets/<name>.png`** — screenshot. If none exists, copy `templates/da-declarative-agent/assets/pending-image.png` and flag a TODO in the README (CONTRIBUTING requires a real 1920x1080 screenshot before submission).

### 4. Handle missing fields

- **No conversation starters in source:** author 4–6 derived from the instructions / example interactions.
- **No icons / screenshot:** use the generic icons and the pending-image placeholder; flag both as TODO.

### 5. Preserve attribution

Credit the **original** author in both `README.md` Contributors and `sample.json` `authors`, sourced from the original `assets/sample.json` `authors` array (verbatim — keep `gitHubAccount`, `name`, and the exact `pictureUrl`). If the source has no `sample.json`, derive the author from the readme `## Authors` section instead. Note in the README that the sample was converted from `pnp/copilot-prompts`. This respects the CONTRIBUTING "rights to share" rule. Add the converter as an **additional** contributor — never overwrite or omit the original author.

For the README **Contributors** list, render each original author as `* [<name>](https://github.com/<gitHubAccount>)`.

## Checks (run before opening a PR)

Reuse the `declarative-agent-sample-review` skill's checklist, plus:

1. Folder name starts with `da-`, contains no periods.
2. Files present: `appPackage/{manifest.json,declarativeAgent.json,instruction.txt,loc/manifest.en-US.json,color.png,outline.png}`, `assets/{sample.json,*.png}`, `README.md`, `teamsapp.yml`, `.gitignore`, `.vscode/`, `env/.env.dev`.
3. All JSON parses; `declarativeAgent.json` `version` is `v1.2` and `$[file('instruction.txt')]` resolves to an existing file; every `[[token]]` in `declarativeAgent.json` has a matching `localizationKeys` entry.
4. `teamsapp.yml` has **no `projectId`**.
5. README has Contributors with real names, a Version history with a real author, and the markdown tracking image at the end; no trailing `---`.
6. `sample.json` `name` = `pnp-copilot-pro-dev-da-<name>`; `url`/`downloadUrl` consistent with the README.
7. No `.zip` anywhere under `samples/` (the `no-zip-in-samples` workflow blocks them).
8. **Instruction completeness:** `appPackage/instruction.txt` reproduces the full source prompt — first and last lines match the source code block and no sections are missing. It must NOT end mid-sentence or mid-section.
9. **Author fidelity:** every author object from the source `assets/sample.json` is present in the new `sample.json` `authors` with `gitHubAccount`, `name`, and the original `pictureUrl` unchanged; the original author also appears in the README Contributors.

## Catalog

After adding the sample, regenerate the root `README.md` table and `.github/samples.json`:

```bash
pwsh ./.github/Generate-SampleList.ps1
```

Commit the regenerated catalog with the new sample folder. Open one PR per converted sample.
