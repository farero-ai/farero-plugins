---
name: pstack-on-farero
description: Start here for pstack in Farero. Lists every pstack skill and when to use it, the pstack roles and Workflow templates, and what this package leaves out. Use when the person asks for pstack, poteto-mode, a pstack skill by name, or which pstack skill fits a task.
---

# pstack in Farero

pstack is Lauren Tan's set of agent workflows. This package holds pstack 0.15.36 from https://github.com/cursor/plugins/tree/main/pstack, with each upstream file unchanged. The skills were written for Cursor. The pstack plugin's agent instructions say how their Cursor steps work in Farero. `plugin_guide` gives you those instructions with the plugin entry and with each skill.

## Where to start

- For work in the pstack style, read `poteto-mode`. It matches the task to a playbook and sends you to the other skills.
- For help to pick a skill, a playbook or a principle, read `poteto-help`. Skip its setup steps for Cursor and the other hosts it names.

## Skills

The skills marked "top-level" start Farero helpers. They are unavailable in a helper chat and in a Workflow member.

Work and style:

- `poteto-mode`: poteto's working style and the playbooks for investigations, bug fixes, features, refactors, performance work, PRs and long runs.
- `poteto-help`: pick the skill, playbook or principle for a task.
- `figure-it-out`: design an auditable playbook for a large or unusual task that no playbook fits.
- `sharpen`: make a task deeper, not bigger, then rewrite the prompt.

Design and code:

- `architect`: sketch types, signatures and modules before code, then keep the implementation on the sketch.
- `tdd`: write the failing test first, when the person asks for TDD or the bug has a cheap local test.
- `typescript-best-practices`: rules for any .ts or .tsx file.
- `arena` (top-level): race candidates at one task, pick a base and graft the best parts of the others into it.
- `swarm` (top-level): fan out parallel workers, drain them and return one report.

Review and verification:

- `interrogate` (top-level): adversaries on several models try to break a change. Only findings that a rerun proves stay.
- `blast-radius`: find what a change can break outside the diff, and prove the fact that makes it safe.
- `no-comments` (top-level): run Comment Sicko and act on the findings you accept.
- `benchmark-checklist`: vet a performance number before you report it or act on it.
- `correct`: find the mistakes that agents repeat in this repository and make each one impossible.
- `create-verification-skill`: write a project skill that drives the app the way a user does.
- `maintain-verification-skill` (top-level): keep that project skill and its feature map true.
- `create-formal-verification-skill`: write a project skill that formally verifies the code where a bug costs the most.
- `maintain-formal-verification-skill`: bring that formal verification back in line after the code changes.

Understanding:

- `how` (top-level): explain how a subsystem works and where a change belongs.
- `why` (top-level): find why code is the way it is, from its history, issues and documents.
- `teach` (top-level): explain a body of work with `how` and `why` so that a person understands it.
- `recall`: rebuild your recent working context from your chat history and the shared record.

Reports and writing:

- `ketchup`: catch the person up on what changed since their last message and what waits on them.
- `show-me-your-work`: keep a decision log for long or unattended work.
- `reflect` (top-level): review the chat with three helpers and turn what you learn into skill edits.
- `unslop`: cut AI tells from any writing.
- `technical-writing`: the standard for documents, RFCs, READMEs, PR descriptions and commit messages.
- `bro`: restate the last message in plain words.
- `in-your-own-words`: restate the person's goal and their problem in your own words.

Principles: `poteto-mode` names when each principle applies. Each one is a short skill.

- `principle-attack-the-premise`, `principle-boundary-discipline`, `principle-build-the-lever`, `principle-encode-lessons-in-structure`, `principle-exhaust-the-design-space`, `principle-experience-first`.
- `principle-explain-the-number`, `principle-fix-root-causes`, `principle-foundational-thinking`, `principle-guard-the-context-window`, `principle-laziness-protocol`, `principle-make-operations-idempotent`.
- `principle-migrate-callers-then-delete-legacy-apis`, `principle-minimize-reader-load`, `principle-model-the-domain`, `principle-never-block-on-the-human`, `principle-outcome-oriented-execution`, `principle-prove-it-works`.
- `principle-redesign-from-first-principles`, `principle-separate-before-serializing-shared-state`, `principle-sequence-verifiable-units`, `principle-subtract-before-you-add`, `principle-test-behavior-not-implementation`, `principle-type-system-discipline`.

## Roles

- `pstack/poteto-agent` does one code-writing or helper task. It reads `poteto-mode` in full first. Its upstream text is the file `agents/poteto-agent.md` in this skill's folder.
- `pstack/second-opinion` runs the same kind of brief on another model family. Farero keeps its model apart from the poteto subagent's models. Use it where a skill asks for a second model.
- `pstack/comment-sicko` deletes narration and workaround comments and flags the code to reshape. Its upstream text is the file `agents/comment-sicko.md` in this skill's folder.
- `pstack/lead` leads the Workflow templates. It starts helpers, so `delegate_task` cannot use it.

The person chooses the models for each role in Farero's role settings.

## Workflow templates

- Poteto mode: the lead runs the matching poteto-mode playbook with poteto subagents, a second model family and Comment Sicko.
- Interrogate a change: adversaries on two model families try to break the change, and the lead keeps the findings that a rerun proves.

The person starts a template from Farero. Installing this package never starts one.

## What this package leaves out

These upstream skills are not in the package:

- `setup-pstack` writes model sheets and hooks for Cursor, Claude Code, Codex and other hosts. Farero's role settings choose the models.
- `statechart` runs its bundled TypeScript pipeline with TLC and Java, which mise installs on first use. A Farero package cannot run bundled programs.
- `make-bot-ui` builds a webhook page for Grok Bot with tools that only Grok Bot has.
- `automate-me` writes a personal skill into Cursor's skill folders from Cursor's transcript folder, with Cursor's built-in `create-skill`.
- `ketchup-video` needs a video renderer, such as ffmpeg, that this package cannot provide. `ketchup` gives the same catch-up as text and pictures.

Other limits:

- The scripts in `poteto-mode/scripts/` and `show-me-your-work/scripts/` are not run. The steps that run them say so, or you do them by hand.
- Skills from other Cursor plugins, such as `deslop`, `control-ui` and `control-cli` from `cursor-team-kit`, are not installed.
- `create-formal-verification-skill` sends TLA+ results to `statechart`, which is left out. Read the TLC output directly.
