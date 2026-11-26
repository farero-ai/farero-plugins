# gstack for Farero

Install gstack to use Garry Tan’s planning, review, testing and shipping skills with Farero’s roles and Workflows. Farero follows gstack’s published releases and updates the selected skills in the background. The plugin’s version identifies the Farero integration.

Upstream project: https://github.com/garrytan/gstack (MIT, Copyright (c) 2026 Garry Tan).
Farero maintains this package, not gstack. It claims no support from the gstack project.

## How it works in Farero

gstack's skills were written for Claude Code with gstack's installer, its shell and Bun
programs, and its own browser. This package contains none of those programs. It adds agent
instructions (`ai.farero/instructions.md`) that tell the agent how each gstack step maps to
Farero:

- The agent reads a skill and the files in its folder through `plugin_guide`.
- It skips gstack's startup block, telemetry, update checks, question tuning, onboarding and
  every log or receipt step. It never runs a gstack program and never tells you to run gstack's
  installer.
- Where a skill starts a subagent, the agent delegates to a gstack role. Where gstack asks Codex
  for an outside voice, the `gstack/outside-voice` role gives it on a different model. Models
  come from Farero's role settings.
- Questions come to you in the chat. A helper does not ask you; it reports open questions.
- Browser steps use Farero's browser tools. This mapping is by instruction: the skills still
  describe gstack's Aside browser and browse daemon, and the agent translates each step. Script
  evaluation, performance timing, cookie import, full-page screenshots and saved screenshot
  files have no Farero equivalent, so those checks do not run and the agent says so.
- Files under `~/.gstack` are optional. The agent writes there only when the file is the
  result you asked for, such as a `/context-save` checkpoint.

## Contents

| Path | Purpose |
| --- | --- |
| `plugin.json` | Manifest with the roles, the Workflow templates and the skill requirements. |
| `ai.farero/instructions.md` | How gstack's paths, scripts, questions, helpers and browser steps map to Farero. |
| `roles/*.md` | Instructions for each role. |
| `skills/gstack-on-farero/` | Entry skill: the skill catalog, roles, templates and limits, and five upstream reference files under `upstream/`. |

## Skills

| Skill | What it does | Needs |
| --- | --- | --- |
| `autoplan` | Runs the CEO, design, developer-experience and engineering plan reviews as one chain, with one approval gate | A top-level chat |
| `plan-ceo-review` | Reviews a plan's premise, scope and ambition | |
| `plan-design-review` | Reviews the user-interface parts of a plan | |
| `plan-devex-review` | Reviews the developer-facing parts of a plan | |
| `plan-eng-review` | Reviews a plan's architecture, edge cases, failure modes and tests | |
| `office-hours` | Tests a product idea in YC office-hours style and writes a design document | |
| `spec` | Turns a vague request into a precise spec | |
| `review` | Reviews a branch's diff before it lands | |
| `ship` | Merges the base, runs the tests, reviews the diff, updates the version and changelog, pushes and opens a pull request | `gh` |
| `land-and-deploy` | Merges a pull request, waits for the deploy and checks production | `gh`, deploy setup |
| `setup-deploy` | Records the deploy settings for `land-and-deploy` | |
| `document-release` | Updates the documentation after a change ships | |
| `document-generate` | Writes missing documentation | |
| `retro` | Writes an engineering retrospective from the git history | `global` mode is not available |
| `health` | Runs the project's own checks and shows a quality dashboard | |
| `test-audit` | Finds low-value or duplicate tests | |
| `build-check` | Runs the project's checks and fixes the code until they pass | |
| `modernize` | Brings an old pull request onto its current base and decides MODERNIZE, REWORK or CLOSE | `gh` |
| `deslop-shared-libs` | Finds code in recent work that is worth sharing | |
| `write-skill` | Writes or trims an agent skill | |
| `context-save` | Saves the working context as a checkpoint file | |
| `context-restore` | Restores a saved checkpoint | |
| `qa` | Tests a site, an API or a command line, then fixes the bugs | Browser tools for a web target |
| `qa-only` | Tests the same targets and reports the bugs | Browser tools for a web target |
| `design-review` | Checks a live interface for visual and interaction defects, then fixes them | Browser tools |
| `devex-review` | Tests a developer product's documentation and first-run flow live | Browser tools |
| `design-consultation` | Proposes a design system and writes `DESIGN.md` with an HTML preview | |
| `design-shotgun` | Explores several design directions as HTML variants | |

gstack's design program is not in this package. The design skills take their own fallback,
HTML wireframes and previews, which gstack treats as a supported path.

The `autoplan` and `plan-ceo-review` skills declare Claude Code hooks that guard the order of
their phases. Farero does not install skill hooks, and the hook programs are left out. The agent
keeps the phase order by instruction.

## Roles

| Selector | Access | Default models, in order | Requirement |
| --- | --- | --- | --- |
| `gstack/lead` | Can delegate | opus (high), gpt-6.2-sol (high) | None |
| `gstack/ceo-reviewer` | Read-only | opus (high), gpt-6.2-sol (high) | None |
| `gstack/design-reviewer` | Read-only | opus (high), gpt-6.2-sol (high) | None |
| `gstack/dx-reviewer` | Read-only | opus (high), gpt-6.2-sol (high) | None |
| `gstack/eng-reviewer` | Read-only | opus (high), gpt-6.2-astra (high) | None |
| `gstack/code-reviewer` | Read-only | opus (high), gpt-6.2-astra (high) | None |
| `gstack/outside-voice` | Read-only | gpt-6.2-sol (high), fable (high) | Must use different models from the code and engineering reviewers, including fallbacks |
| `gstack/qa` | Read-only | opus (high), gpt-6.2-sol (high) | Farero's browser tools |

Farero uses the first available model in each list. You can choose other compatible models for
a role, or bind one of your own roles. An override cannot remove a read-only rule or the
outside voice's independence. With Codex and Claude signed in, the reviewers run on a Claude
model and the outside voice on a Codex model. With one provider, they use different models of
that provider. The QA role stays unavailable until package roles get browser access; run
the QA skills in your own chat instead.

## Workflow templates

| Template | Roles | What it does |
| --- | --- | --- |
| `autoplan` | lead, ceo-reviewer, design-reviewer, dx-reviewer, eng-reviewer, outside-voice | Runs gstack's autoplan chain on one plan and stops at the final approval gate |
| `review` | lead, code-reviewer, outside-voice | Runs gstack's pre-landing review of the current branch and reports ranked findings |

Installing or enabling this package never starts a template and never turns on automatic task
routing. You start a template yourself and can edit its objective first.

## Left out

| Skill | Reason |
| --- | --- |
| `benchmark` | Measures page performance through the browse daemon's perf and script commands. Farero's browser tools have no timing or script evaluation. |
| `benchmark-models` | Runs other agents' command lines (codex, claude, gemini) from the shell. Farero runs models only through its own providers and roles. |
| `browse` | The reference for gstack's browse daemon. It needs the compiled browse program and its long-running Chromium server. |
| `canary` | Saves baseline screenshots to files and compares them after a deploy. Farero's browser screenshots stay in the chat and cannot be saved for a later comparison. |
| `captain` | Runs a crew of agents through Capy's thread tools and gstack's train and digest programs. |
| `careful` | Works only through a Claude Code hook that runs a shell program. Farero does not install skill hooks, so the guard would not run. |
| `codex` | Wraps the codex command line from the shell. Farero runs Codex as a provider; the outside-voice role gives the same second opinion. |
| `cso` | Runs every audit through gstack-cso-launcher. Without it the skill stops with a tooling error by its own rule. |
| `design-html` | Builds finished pages with the vendored Pretext library and the compiled design program. |
| `design-motion` | Captures and encodes motion through gstack's capture programs and ffmpeg. |
| `diagram` | Renders through gstack's offline diagram-render bundle and gstack-render. |
| `eval-plan` | Runs its budget ledger, dry run and pilot through gstack's eval programs and pricing library. |
| `freeze` | Works only through a Claude Code hook that runs a shell program, so the edit boundary would not hold. |
| `gstack-upgrade` | Upgrades a gstack install. Farero updates this package through the plugin directory. |
| `guard` | Turns on the `careful` and `freeze` hooks, which Farero does not install. |
| `ios-clean`, `ios-design-review`, `ios-fix`, `ios-qa`, `ios-sync` | Need Xcode, an iOS device or simulator and gstack's DebugBridge inside the app. |
| `landing-report` | Reads the version queue only through gstack-next-version. |
| `learn` | Reads and writes learnings only through gstack's learnings programs. |
| `make-pdf` | Turns Markdown into a PDF with gstack's compiled make-pdf program. |
| `open-gstack-browser` | Starts gstack's own Chromium with its sidebar extension. The `connect-chrome` link points to it. |
| `pair-agent` | Shares the browse daemon with a remote agent over a tunnel. |
| `plan-tune` | Tunes gstack's question preferences, which only gstack's preamble programs and hooks read. |
| `runaway-stopper` | Needs Capy's thread and subagent tools. |
| `scrape` | Runs and saves browser skills through the browse daemon's skill runner. |
| `setup-browser-cookies` | Imports browser cookies into the browse daemon's session. |
| `setup-gbrain`, `sync-gbrain` | Set up and sync the gbrain command line and its database. |
| `skillify` | Writes browser skills for the browse client and runs them through the browse daemon. |
| `ubicloud` | Needs the Ubicloud command line, an Ubicloud account and gstack's VM programs. |
| `unfreeze` | Clears the `freeze` hook's state. Farero does not install that hook. |

Farero downloads the supported skill instructions, references and templates. Its app settings show the upstream commit in use.

## Credits and license

gstack is by Garry Tan and its contributors, MIT licensed. Farero caches the upstream license and third-party notices with each downloaded revision.
The Farero files in this package are MIT licensed.
