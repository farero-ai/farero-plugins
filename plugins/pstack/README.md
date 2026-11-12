# pstack for Farero

pstack is Lauren Tan's set of agent workflows: poteto-mode and its playbooks, skills to design, review, verify and explain code, and 24 engineering principles. This package holds pstack 0.15.36 from https://github.com/cursor/plugins/tree/main/pstack at commit `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`.

## What is in the package

- 53 of the 58 upstream skills, each folder copied byte for byte into `skills/<name>/`.
- The two upstream agent texts, `poteto-agent.md` and `comment-sicko.md`, in `skills/pstack-on-farero/agents/`.
- `skills/pstack-on-farero/`: the entry skill. It lists every skill, the roles, the Workflow templates and the limits.
- `ai.farero/instructions.md`: the agent instructions that map pstack's Cursor steps to Farero. Farero gives them to the agent with each skill. The upstream text stays unchanged.
- Four roles:
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

- The scripts in `poteto-mode/scripts/` and `show-me-your-work/scripts/` are files to read. The agent does not run them.
- Skills from other Cursor plugins, such as `deslop`, `control-ui` and `control-cli` from `cursor-team-kit`, are not in this package.
- The skills that start helpers work in a top-level chat. A helper chat or a Workflow member cannot start helpers.
- `poteto-agent` and `second-opinion` never share a model. With Codex and Claude signed in, the poteto subagent runs on a Codex model and the second opinion on a Claude model. With one provider, each role uses a different model of that provider.

## Credits and license

The pstack skills and agent texts are by Lauren Tan, `Copyright (c) 2026 Lauren Tan`, under the MIT license. The license text is in `licenses/pstack/LICENSE`. `THIRD_PARTY_NOTICES.md` lists the upstream files, and `PROVENANCE.json` records the commit, the digest of the copied files and the reason each skill is left out. The Farero files are MIT licensed.

## How the package is built

`scripts/plugins/assemble-upstream.ts --plugin pstack` in the Farero repository downloads the pinned commit, checks the copied files against the pinned digest, adds the license and the notices, validates the package and packs it. The pins are in `release/upstream.json`, which is not part of the package.
