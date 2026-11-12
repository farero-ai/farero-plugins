# Review panel

An example package with roles and Workflow templates and no commands. It shows how an author
sets up roles so that a person can install a working review panel without creating roles by
hand.

## Contents

| Path | Purpose |
| --- | --- |
| `plugin.json` | Manifest. The `ai.farero` extension declares four roles and two Workflow templates. |
| `roles/*.md` | Instructions for each role. |
| `skills/review-panel/SKILL.md` | Standard skill that tells an agent how to use the roles. |

## Roles

| Selector | Access | Default models, in order | Requirement |
| --- | --- | --- | --- |
| `review-panel/lead` | Can delegate | opus (high), gpt-6-astra | None |
| `review-panel/reviewer` | Read-only | gpt-6-astra (high), fable (high) | None |
| `review-panel/skeptic` | Read-only | opus (high), gpt-6.1-sol (high) | Must use a different model from the reviewer, including fallbacks |
| `review-panel/ui-check` | Read-only | opus, gpt-6.1-sol | Host browser access |

Farero uses the first available model in each list. You can choose another compatible model
for a role, or bind one of your own roles instead. Your choice is kept across package updates;
an update that makes it incompatible shows the conflict before activation. An override cannot
remove a read-only rule or the skeptic's independence from the reviewer.

## Workflow templates

| Template | Roles | Note |
| --- | --- | --- |
| `review-panel` | lead, reviewer, skeptic | Available when the three roles resolve. |
| `review-panel-ui` | lead, reviewer, skeptic, ui-check | Unavailable until package roles get host browser access. |

Installing or enabling the package never starts a Workflow and never turns on automatic task
routing. You start a template yourself. A started run keeps the package revision, template and
role settings it started with; later updates and edits apply to later runs.

This package is an example of the package shape. It is not a copy of any other review plugin,
and it claims no compatibility with one.
