# pstack in Farero

pstack's skills were written for Cursor. This package keeps their text unchanged. When a pstack skill asks for something that Farero does differently, follow these rules.

## Read the skills

- Read a skill before you use it: call `plugin_guide` with `plugin: "pstack"` and `skill: "<name>"`. When the answer gives a next offset, read again from that offset until you have the whole text.
- A skill names other skills as `../<name>/SKILL.md`, `/<name>` or **<name>**. Read each one the same way before you apply it.
- A skill names its own files, such as `playbooks/feature.md` or `references/explorer-prompt.md`. Read a file with `plugin_guide`, the same `skill`, and `file` set to its path inside the skill's folder. The answer lists the files of each skill.
- The `pstack-on-farero` skill lists every pstack skill, the roles, the Workflow templates and what this package leaves out.

## Helpers

- Where a skill starts a subagent (`Task`, `subagent_type`, "spawn"), call `delegate_task` with a pstack role. Wait for the result with `list_delegations`. Give the helper the goal, the scope and the skills it must read.
  - `subagent_type: "poteto-agent"` and other code-writing delegates: `pstack/poteto-agent`.
  - `subagent_type: "comment-sicko"`: `pstack/comment-sicko`.
  - A second model, another model family, a cross-judge, an adversary or a reviewer that must not share the worker's model: `pstack/second-opinion`.
  - `subagent_type: "generalPurpose"` and other read-only explorers or investigators: a read-only role from `list_roles` that fits the job, or `pstack/poteto-agent` with a brief that says not to change files.
- In a managed Workflow, give the job to one of the Workflow's roles instead of `delegate_task`.
- A helper cannot start helpers of its own. When you are a helper and a skill tells you to start one, do that step yourself and say so in your report.
- Skills that need helpers show as unavailable in a helper chat or a Workflow member. Use them only in a top-level chat.

## Questions

- Where a skill uses `AskQuestion` or `AskUserQuestion`, ask the person in the chat. Keep the skill's rules about when to ask.

## Models

- In a top-level chat running `/interrogate`, use `pstack/reviewer` for the reviewers. In `/arena`, use `pstack/arena-runner` for the runners only. These assignments take precedence over upstream model sheets, minimum panel sizes, and the generic helper roles above.
- Read the role's `panel.makers` in `list_roles`. Send the same brief once per listed maker with `delegate_task(role, maker, prompt)`. Keep each runner's candidate separate. Farero's Auto selector picks a model for that maker. Wait for the tracked reports.
- For the arena judge, send one separate helper the anonymized candidates and a read-only judging brief. Prefer an available read-only role. If none fits, send the brief to one `pstack/reviewer` with a single named maker. Judge a single candidate on its merits.
- In the final result, write one line with the models that actually reported, for example “Reviewed by opus (Anthropic) and gpt-6-astra (OpenAI).” Each successful report in `list_delegations` records its maker and model in `source.reviewer`. If only one maker reported, include “Single-maker review” on that line and name other makers that would add coverage from `panel.additionalMakers` or the makers whose reviews failed. Continue with one reviewer. If only an unidentified model reported, say the maker is unconfirmed. If no reviewer completed, say so.
- A managed Workflow uses the roles frozen at its start.

- The models come from the role settings in Farero. Skip model sheets and model setup: `/setup-pstack`, `pstack-models.mdc`, `pstack-models.md`, model slugs and the budget steps.
- Where a skill tells you to pick a model, a reasoning level or a speed, use the role that fits and say which role you used.

## Steps to skip

- Skip setup steps, hooks, automatic routing, update checks and telemetry prompts.
- When a step calls a pstack script such as `scripts/check-plan.mjs` or `scripts/watch-pr/watch-pr`, complete the step with the Farero tools or do it by hand.
- Cursor's paths and tools are not here: `~/.cursor/`, Cursor rules, Cursor's built-in skills such as `create-skill` and `babysit`, and Cursor modes.
- For chat history, use `search_chats` and `read_chat`. They replace the `agent-transcripts/` folder that `recall`, `reflect` and `show-me-your-work` read. Read only this workspace's chats unless the person asks for more.
- For a todo list, use your own plan or task tool.
- Skills from other Cursor plugins are not in this package, for example `deslop`, `control-ui` and `control-cli` from `cursor-team-kit`. When a step names one, say that it is not installed.

## Browser

- Browser steps use Farero's browser tools.

## Reports

- When a step needs something that this package or this chat does not have, say so plainly and name it.
- Never claim that a step ran when it did not.
