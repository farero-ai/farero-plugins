# pstack for Farero

Install pstack to use Lauren Tan’s skills and playbooks with Farero’s roles and Workflows. Farero follows the pstack directory in Cursor’s plugin repository and updates the selected skills in the background. The plugin’s version identifies the Farero integration.

## What you can use

- 53 upstream skills with their reference files and playbooks.
- The two upstream agent texts, `poteto-agent.md` and `comment-sicko.md`, in `skills/pstack-on-farero/agents/`.
- `skills/pstack-on-farero/`: the entry skill. It lists every skill, the roles, the Workflow templates and the limits.
- `ai.farero/instructions.md`: the agent instructions that map pstack's Cursor steps to Farero. Farero gives them to the agent with each skill. The upstream text stays unchanged.
- Package roles:
  - `pstack/reviewer` and `pstack/arena-runner` choose one enabled model per maker with Auto. The arena judge runs once.
  - `pstack/poteto-agent` does one code-writing or helper task.
  - `pstack/second-opinion` runs a brief on another model family.
  - `pstack/comment-sicko` deletes narration and workaround comments.
  - `pstack/lead` leads the Workflow templates.
- Two Workflow templates, Poteto mode and Interrogate a change. They start only when you choose one.

## What is left out

- `setup-pstack` writes model sheets and hooks for Cursor, Claude Code, Codex and other hosts. Farero's role settings choose the models.
- `statechart` runs its bundled TypeScript pipeline with TLC and Java, which mise installs on first use. A Farero package cannot run bundled programs.
- `make-bot-ui` builds a webhook page for Grok Bot with tools that only Grok Bot has.
- `automate-me` writes a personal skill into Cursor's skill folders from Cursor's transcript folder, with Cursor's built-in `create-skill`.
- `ketchup-video` needs a video renderer, such as ffmpeg, that this package cannot provide. `ketchup` gives the same catch-up as text and pictures.

## Limits

- If an upstream step uses a pstack script, follow the Farero instructions for that step.
- Skills from other Cursor plugins, such as `deslop`, `control-ui` and `control-cli` from `cursor-team-kit`, are not in this package.
- The skills that start helpers work in a top-level chat. A helper chat or a Workflow member cannot start helpers.
- `poteto-agent` and `second-opinion` never share a model. With Codex and Claude signed in, the poteto subagent runs on a Codex model and the second opinion on a Claude model. With one provider, each role uses a different model of that provider.

## Credits and license

The pstack skills and agent texts are by Lauren Tan, Copyright (c) 2026 Lauren Tan, under the MIT license. Farero caches the upstream license with each downloaded revision. The Farero files are MIT licensed.
