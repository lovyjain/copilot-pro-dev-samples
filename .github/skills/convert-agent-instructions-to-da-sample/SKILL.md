---
name: convert-agent-instructions-to-da-sample
description: Convert a single agent-instructions folder from pnp/copilot-prompts (samples/agent-instructions/*) into a declarative agent (da-*) sample in pnp/copilot-pro-dev-samples. Use when asked to "convert an agent instruction", "turn a copilot-prompts agent into a sample", or port an *.agent.md / agent-instructions folder into a da- sample. Triggers on requests referencing github.com/pnp/copilot-prompts agent-instructions.
---

# Convert Agent Instructions → Declarative Agent Sample

Convert **one** agent-instructions folder from
[`pnp/copilot-prompts/samples/agent-instructions/<name>`](https://github.com/pnp/copilot-prompts/tree/main/samples/agent-instructions)
into a declarative agent (`da-`) sample in this repo.

Follow `docs/converting-agent-instructions-to-samples.md` and `AGENTS.md` — this skill operationalizes them.

## Hard rules (from AGENTS.md)

- **One sample per PR / branch**, forked from `main`, targeting `main`.
- Only create/modify files inside the new `samples/da-<folder>/` folder (plus the root README row).
- No secrets, tenant IDs, or app IDs committed. No `projectId` in the yml.
- All assets local to `assets/` — no external asset URLs.
- Instructions file **≤ 8,000 characters**.
- Use the **latest** manifest schema versions (verify against Microsoft Learn, don't copy old samples).

## Step 0 — Pick and confirm the source

The `agent-instructions` folder contains many sub-folders (one agent each). Confirm exactly **one**
source folder with the user before starting. Fetch its contents:

```bash
gh api repos/pnp/copilot-prompts/contents/samples/agent-instructions/<name>
```

Read its `readme.md` (the persona + instructions body) and note any front matter, tool list,
example prompts, and the original author (from readme credits / git history).

### Suitability check

| Source signal | Action |
|---------------|--------|
| Value is in the instructions themselves (coaching, writing, planning, explaining) | ✅ Convert |
| Relies on IDE-only tools (`editFiles`, `codebase`, `terminal`) | ⚠️ Remove those instruction passages; keep persona/rules |
| Needs external APIs / real data sources | ⚠️ Flag to user — may need an API plugin, out of scope for instructions-only |
| Pure task prompt with no persona | ❌ Poor fit — tell the user |

## Step 1 — Create the folder

Name: `samples/da-<kebab-case-name>` (lowercase, hyphens, no periods). Structure to produce:

```
samples/da-<folder>/
  .gitignore
  README.md
  m365agents.yml
  env/.env.dev
  appPackage/
    declarativeAgent.json
    manifest.json
    instruction.md
    color.png
    outline.png
  assets/
    sample.json
    screenshot.png   (add after testing; use pending-image.png as placeholder if needed)
```

Copy icons (`color.png`, `outline.png`) and starter files from an existing `da-` sample
(e.g. `samples/da-PositivityAgent`) and the templates in `templates/da-declarative-agent/`.

## Step 2 — Port the instructions → `appPackage/instruction.md`

- Paste the readme's instruction body (strip any YAML front matter).
- Rewrite IDE assumptions into chat context: "the open file" → "the text the user shares",
  "the workspace" → "the content provided", "apply the edit" → "suggest the change".
- Keep persona, tone, rules, and output-format guidance.
- **Trim to ≤ 8,000 characters.** Verify:
  ```powershell
  (Get-Content appPackage/instruction.md -Raw).Length
  ```

## Step 3 — `appPackage/declarativeAgent.json`

Use the latest schema (verify at
learn.microsoft.com/microsoft-365-copilot/extensibility/declarative-agent-manifest — increment the
version in the URL to find newest):

```json
{
  "$schema": "https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.X/schema.json",
  "version": "v1.X",
  "name": "<Agent Name>",
  "description": "<one-line description>",
  "instructions": "$[file('instruction.md')]",
  "capabilities": [ { "name": "WebSearch" } ],
  "conversation_starters": [
    { "title": "...", "text": "..." }
  ]
}
```

- 2–6 `conversation_starters` derived from the source's example prompts.
- Map tools → capabilities (omit if none apply):

  | Source tool | Capability |
  |-------------|-----------|
  | `websearch` / `fetch` | `WebSearch` |
  | code execution / data analysis | `CodeInterpreter` |
  | image generation | `GraphicArt` |
  | file/document lookup | `OneDriveAndSharePoint` |
  | IDE tools (`editFiles`, `codebase`, `terminal`) | none — remove |

## Step 4 — `appPackage/manifest.json`

Use the latest Teams/M365 manifest schema (verify at
developer.microsoft.com/json-schemas/teams — increment version to find newest). Mirror the
agent name/description. Keep the `copilotAgents.declarativeAgents` block pointing at
`declarativeAgent.json`. Use `${{TEAMS_APP_ID}}` and `${{APP_NAME_SUFFIX}}` placeholders — never a
real app id.

## Step 5 — `m365agents.yml`

- Add, right after `version`:
  ```yaml
  additionalMetadata:
    sampleTag: pnp-copilot-pro-dev:da-<folder>
  ```
- **No `projectId`.** If porting from an older sample with `teamsapp.yml`, migrate to `m365agents.yml`.

## Step 6 — `env/.env.dev`

Blank generated values (no committed IDs):

```
TEAMSFX_ENV=dev
APP_NAME_SUFFIX=dev
TEAMS_APP_ID=
TEAMS_APP_TENANT_ID=
M365_TITLE_ID=
M365_APP_ID=
```

## Step 7 — `README.md`

Copy `samples/_SAMPLE_templates/any-sample/README.md` (or `templates/da-declarative-agent/README-template.md`)
and fill in:

- Title, Summary, Features.
- **Contributors**: the original instruction author (full name + GitHub profile link) plus the converter.
- **Version history** with a real author (not "Microsoft").
- Replace every `YOUR_AGENT_FOLDER` placeholder with `da-<folder>`.
- Link the original source file in copilot-prompts (license credit — copilot-prompts is MIT, credit required).
- Tracking image (markdown, last line, no trailing `---`):
  ```
  ![](https://m365-visitor-stats.azurewebsites.net/copilot-pro-dev-samples/samples/da-<folder>)
  ```

## Step 8 — `assets/sample.json`

Base on `templates/da-declarative-agent/assets/template-sample.json`. Set:

- `name`: `pnp-copilot-pro-dev-da-<folder>` (lowercase)
- `title`, `shortDescription`, `longDescription`
- `url` / `downloadUrl`: point at `samples/da-<folder>`
- `creationDateTime` / `updateDateTime`: today (YYYY-MM-DD)
- `metadata`: `PLATFORM`, `LANGUAGE`, `AGENT-TYPE` = Declarative Agent, `API-PLUGIN` = No, `GRAPH-CONNECTOR` = No
- `thumbnails[].url`: raw GitHub URL to the local screenshot in `assets/`
- `authors`: the real author(s) — matches README Contributors
- Keep consistent locale in URLs (avoid mixing `en-us/`)

## Step 9 — Register in root README

Add one row to the samples table in the root `README.md` for the new sample. Do not touch anything
else outside the sample folder.

## Step 10 — Test & screenshot

- If tooling is available, provision with Microsoft 365 Agents Toolkit into a Copilot tenant and run
  the conversation starters. Capture a 1920×1080 `.png` of the agent answering into `assets/`.
- If you cannot test in a tenant, tell the user a screenshot is still required before merge and leave
  the placeholder — do not fabricate a screenshot.

## Step 11 — Validate before PR

```powershell
# JSON is well-formed
Get-ChildItem -Recurse samples/da-<folder> -Include *.json | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null; "$($_.Name) OK" }
# instruction length (must be <= 8000)
(Get-Content samples/da-<folder>/appPackage/instruction.md -Raw).Length
# no projectId / secrets
Select-String -Path samples/da-<folder>/* -Pattern "projectId" -Recurse
```

## Step 12 — Review the PR

After the PR is opened, validation is **not** automatic. Run the
[`declarative-agent-sample-review`](../declarative-agent-sample-review/SKILL.md) skill against the new
PR to check manifest schema versions, `m365agents.yml` (no `projectId`), README (Contributors +
real author + tracking image), and `assets/sample.json` (name + authors). Trigger it explicitly, e.g.
"review PR #N with the declarative-agent-sample-review skill".

## Final checklist

- [ ] Single source folder confirmed; suitable for instructions-only conversion
- [ ] `samples/da-<folder>/` with all required files; icons present
- [ ] `instruction.md` ≤ 8,000 chars, IDE-specific content rewritten/removed
- [ ] Latest schema versions in both manifests
- [ ] `sampleTag` set, no `projectId`, blank env values, no secrets
- [ ] Original author credited; source file linked in README
- [ ] Tracking image + row added to root README
- [ ] Screenshot captured (or user told it's required)
- [ ] Only files inside the sample folder + root README row changed; one sample per PR
