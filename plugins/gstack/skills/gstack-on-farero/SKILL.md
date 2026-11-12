---
name: gstack-on-farero
description: Start here for gstack in Farero. Use when the person asks for gstack or a gstack skill such as /autoplan, /review, /ship or /qa, or asks which gstack skills, roles and Workflow templates this package has and what it leaves out.
---

# gstack on Farero

This package holds 28 skills from gstack 1.99.0.0 by Garry Tan (MIT), pinned at commit
`9ab50347ac3728b7bdf03735b4ccceca88b6d958`. The skill text is unchanged. Before the first gstack
skill in a chat, read the package instructions with `plugin_guide` and `plugin: "gstack"`. They
say how gstack's paths, scripts, questions, helpers and browser steps map to Farero.

Read a skill with `plugin_guide`, `plugin: "gstack"` and `skill: "<name>"`. Read a file of a
skill by adding `file`, for example `skill: "review"` and `file: "checklist.md"`.

## Skills

| Skill | Use it to | Needs |
| --- | --- | --- |
| `autoplan` | Run the CEO, design, developer-experience and engineering plan reviews as one chain, with auto-decisions and one approval gate at the end | A top-level chat, because it starts helpers |
| `plan-ceo-review` | Review a plan's premise, scope and ambition | |
| `plan-design-review` | Review the user-interface parts of a plan | |
| `plan-devex-review` | Review the developer-facing parts of a plan | |
| `plan-eng-review` | Review a plan's architecture, edge cases, failure modes and tests | |
| `office-hours` | Test a product idea in YC office-hours style and write a design document | |
| `spec` | Turn a vague request into a precise spec that an agent can carry out | |
| `review` | Review a branch's diff before it lands | |
| `ship` | Merge the base, run the tests, review the diff, update the version and changelog, push and open a pull request | `gh` |
| `land-and-deploy` | Merge a pull request, wait for the deploy and check production | `gh` and the project's deploy setup |
| `setup-deploy` | Record the project's deploy settings for `land-and-deploy` | |
| `document-release` | Bring the documentation up to date after a change ships | |
| `document-generate` | Write missing documentation for a feature, a module or a project | |
| `retro` | Write an engineering retrospective from the git history | The `global` mode is not available |
| `health` | Run the project's type checker, linter, tests and other tools and show a quality dashboard | |
| `test-audit` | Find low-value or duplicate tests and the test-only code they keep alive | |
| `verify` | Run the project's checks and fix the code until they pass | |
| `modernize` | Bring an old pull request onto its current base and decide MODERNIZE, REWORK or CLOSE | `gh` |
| `deslop-shared-libs` | Find code in recent work that is worth sharing | |
| `write-skill` | Write a new agent skill or trim one | |
| `context-save` | Save the working context as a checkpoint file | |
| `context-restore` | Restore a checkpoint that `context-save` wrote | |
| `qa` | Test a site, an API or a command line, then fix the bugs it finds | Farero's browser tools for a web target |
| `qa-only` | Test the same targets and only report the bugs | Farero's browser tools for a web target |
| `design-review` | Check a live interface for visual and interaction defects, then fix them | Farero's browser tools |
| `devex-review` | Test a developer product's documentation and first-run flow live | Farero's browser tools |
| `design-consultation` | Propose a design system and write `DESIGN.md` with an HTML preview | |
| `design-shotgun` | Explore several design directions as HTML variants and collect feedback | |

## Roles

Delegate with `delegate_task` and the selector, for example `gstack/code-reviewer`. Only a
top-level chat can delegate.

| Selector | Access | Default models, in order | Requirement |
| --- | --- | --- | --- |
| `gstack/lead` | Can delegate; leads a Workflow template | opus (high), gpt-6.1-sol (high) | None |
| `gstack/ceo-reviewer` | Read-only | opus (high), gpt-6.1-sol (high) | None |
| `gstack/design-reviewer` | Read-only | opus (high), gpt-6.1-sol (high) | None |
| `gstack/dx-reviewer` | Read-only | opus (high), gpt-6.1-sol (high) | None |
| `gstack/eng-reviewer` | Read-only | opus (high), gpt-6-astra (high) | None |
| `gstack/code-reviewer` | Read-only | opus (high), gpt-6-astra (high) | None |
| `gstack/outside-voice` | Read-only | gpt-6.1-sol (high), fable (high) | Different models from the code and engineering reviewers, including fallbacks |
| `gstack/qa` | Read-only | opus (high), gpt-6.1-sol (high) | Farero's browser tools |

The lead role starts helpers, so it runs only as the lead of a Workflow template. Farero uses
the first available model in each list. The person can choose other models in Settings.

## Workflow templates

| Template | Roles, lead first | What it does |
| --- | --- | --- |
| `autoplan` | lead, ceo-reviewer, design-reviewer, dx-reviewer, eng-reviewer, outside-voice | gstack's autoplan chain on one plan |
| `review` | lead, code-reviewer, outside-voice | gstack's pre-landing review of the current branch |

The person starts a template in Farero. Installing or enabling this package never starts one.

## Upstream reference files

Skills point to these gstack files. They are in this skill's folder:

| gstack path | Read with `skill: "gstack-on-farero"` and `file:` |
| --- | --- |
| `ETHOS.md` | `upstream/ETHOS.md` |
| `docs/askuserquestion-cjk.md` | `upstream/docs/askuserquestion-cjk.md` |
| `docs/askuserquestion-split.md` | `upstream/docs/askuserquestion-split.md` |
| `docs/test-value-bar.md` | `upstream/docs/test-value-bar.md` |
| `scripts/jargon-list.json` | `upstream/scripts/jargon-list.json` |

## Left out

These gstack skills are not in this package. The README and `PROVENANCE.json` give the reason
for each one.

- gstack's own browser and the programs around it: `browse`, `open-gstack-browser`,
  `setup-browser-cookies`, `pair-agent`, `scrape`, `skillify`, `benchmark`, `canary`.
- Compiled programs and render bundles: `make-pdf`, `design-html`, `design-motion`, `diagram`.
- Wrappers around other agents' command lines: `codex`, `benchmark-models`.
- iOS devices and Xcode: `ios-clean`, `ios-design-review`, `ios-fix`, `ios-qa`, `ios-sync`.
- Hook guards: `careful`, `freeze`, `guard`, `unfreeze`.
- gstack's state and launcher scripts: `learn`, `landing-report`, `plan-tune`, `cso`,
  `eval-plan`.
- Other services and hosts: `setup-gbrain`, `sync-gbrain`, `captain`, `runaway-stopper`,
  `ubicloud`, `gstack-upgrade`.

When the person asks for one of these, say that this package does not include it and why.

## Limits

- No gstack program, script or hook runs. Steps that only log, tune questions or check for
  updates are skipped.
- Browser steps use Farero's browser tools. Script evaluation, performance timing, cookie import,
  full-page screenshots and saved screenshot files are not available.
- The outside voice runs through a Farero role, on a model that the code and engineering
  reviewers do not use. It never runs the `codex` command line.
- Package roles do not get browser access yet, so `gstack/qa` is unavailable. Run the QA skills
  in a chat that has Farero's browser tools instead.
