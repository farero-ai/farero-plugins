# File summary

A small Farero plugin. Its `summarize` command counts the lines and words of a text file that
ships inside the package and prints the first lines. Use it to learn the package format, then
replace the command with your own tool.

## Files

| File | Purpose |
| --- | --- |
| `plugin.json` | Portable Agent Plugins manifest. The `ai.farero` extension declares the command and its config. |
| `README.md` | This file. |
| `skills/file-summary/SKILL.md` | Standard skill. It tells the agent when to use the command. |
| `ai.farero/summary.mjs` | The command. It uses only the Node standard library. |
| `ai.farero/fixture.txt` | The text that the command summarizes. |

## Inputs and config

| Name | Kind | Rule | Default |
| --- | --- | --- | --- |
| `label` | Command input | Required string, at most 80 characters. An empty string is valid. | None |
| `maxLines` | Command input | Whole number from 1 to 10. Zero is invalid. | 2 |
| `heading` | Saved config | String, at most 80 characters. An empty heading stays empty. | `Example` |

Farero gives the command three separate arguments in this order: label, maxLines, heading.
It does not use a shell, so a label like `release; $(echo unsafe)` stays one literal value.
The working directory is the calling chat's worktree. The command reads `fixture.txt` from its
own package directory.

## Expected result

With the label `First try` and the default config, the command prints:

```text
Example: First try
Lines: 3
Words: 6
First 2 lines:
One small example
Two words
```

## Check, install and update

```sh
farero plugins validate ./file-summary
farero plugins inspect ./file-summary
```

`validate` checks this folder and runs no code. `inspect` asks the running app to copy the
folder into an immutable snapshot and shows the exact files and digest for review. Install that
reviewed digest from Settings, Plugins, or with `farero plugins install <digest>`.

Farero runs the installed snapshot, not this folder. After you edit the folder, stage the change
from the same path and authorize the new digest:

```sh
farero plugins update <installation-id> --source ./file-summary
```

## Network, keys and data

This plugin needs no network access, no API key and no dependency. It sends no data anywhere.

## Where the command is available

| Context | `summarize` command | Skill text |
| --- | --- | --- |
| Chat with full access in a workspace, plugin enabled for that scope | Available | Available |
| Managed helper with full access in a workspace | Available | Available |
| Chat or helper without a workspace | Unavailable: the command needs a workspace | Unavailable: requires the command |
| Read-only helper, question-only chat or Docker sandbox | Unavailable: no host command execution | Unavailable: requires the command |
| Plugin paused or not enabled for the scope | Unavailable | Unavailable |

Installing a plugin does not enable it. Choose a scope in Settings, Plugins.

## Reference

The `ai.farero` extension is experimental, version 0.1. See the plugin format reference:
https://farero.ai/docs/plugin-format/
