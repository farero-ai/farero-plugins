# Jevgrep for Farero

Jevgrep answers questions about how, why or where something works in a repository. It returns
the relevant files, locations and verbatim source excerpts. This package runs the unmodified
jevgrep 0.8.5 command line through Farero's managed plugin commands, with your own provider key.

Upstream project: https://github.com/dzhng/jevgrep (MIT). Farero maintains this adapter, not the
search itself.

## What it can do

| Command | What it does | Needs a key | Sends data |
| --- | --- | --- | --- |
| `search` | Answers one behavior question about a folder of the worktree. | Yes | Eligible source, to the provider you choose |
| `files` | Counts the files and bytes a search may read under a folder. | No | Nothing |

The `jevgrep-search` skill tells the agent when to search and how to read the result. It
replaces the upstream setup steps: agents never install `jg`, run `npm` or `npx`, or ask for a
key in chat.

Both commands declare `readOnly`, so a read-only chat can run them. They leave the worktree
unchanged: a search writes its key copy and its cache only to Farero's own plugin folders.

## Role

| Role | What it does |
| --- | --- |
| `jevgrep/explore` | A read-only helper for how, why or where questions. It starts with one search, reads the cited files in full and reports files, locations and evidence. |

The role needs the `search` command, so it is available only after you add a key. Its default
models are `gpt-6.1-terra` and then `sonnet`, at medium effort. You can choose other models for
it in Settings, Plugins, Jevgrep.

## Your key and your provider

You bring the key. Add it in Settings, Plugins, Jevgrep. Farero stores it encrypted and gives it
only to the `search` command, once per run, on standard input. It never goes into command
arguments, the environment, the transcript or the result. Saving a key makes no request and
costs nothing; the first search shows whether the provider accepts it.

Choose the provider in the plugin config: `typesafe` (default), `vercel`, `openrouter` or
`opencode`. A search sends request data only to that provider's address, and the adapter refuses
redirects. Each search runs the pinned command line's own `auth --stdin` into a private folder
that Farero removes after the run. Your global jevgrep setup in `~/.config/jevgrep` is never read
or changed.

## Limits on each search

| Config | Default | Range | What it limits |
| --- | --- | --- | --- |
| `maxRequests` | 300 | 1 to 1000 | Provider requests in one search |
| `maxUploadMiB` | 16 | 1 to 64 | Request data sent to the provider in one search |
| `timeLimitSeconds` | 240 | 10 to 600 | Time before the search stops and prints what it found |

Requests run four at a time. The adapter counts every request body before it leaves the
process. When a search would pass a limit, the adapter stops it and returns the partial result
with a note that says which limit stopped it. The defaults are provisional: they are set again
from the first measured real task before this package is listed in the directory.

The `maxSourceBytes` input (default 60000) limits only the source excerpts in the printed
result. It does not limit the data sent to the provider; the limits above do that. Farero also
caps each output stream at 256 KiB.

These limits apply to what this adapter sends. They are not an operating system sandbox, and
your provider's billing is yours to check.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Complete, or partial only because of jevgrep's own resource limits |
| 1 | Failed |
| 2 | Incomplete because of a provider, network or other operational issue |
| 3 | Stopped at an adapter limit; the output is partial |
| 64 | Invalid input to the adapter |
| 65 | The key is missing or was refused before any request |
| 70 | The package is incomplete |
| 130 | Stopped by Farero |

A nonzero exit does not prove that no request was sent. Farero keeps the original result; it
never runs a search again on its own.

## How the package is built

This folder is the adapter source. It does not contain jevgrep. The release recipe assembles
the installable package:

```sh
node --import tsx/esm scripts/plugins/assemble-jevgrep.ts --out output/plugins
```

The recipe installs the three pinned npm release archives in `release/sources.json`
(`@dzhng/jevgrep` 0.8.5, `typescript` 5.9.3 and `web-tree-sitter` 0.27.0) with lifecycle scripts
turned off. It checks each archive's integrity and registry signature, and the published
provenance of jevgrep and web-tree-sitter against the pinned repository, workflow and commit.
TypeScript 5.9.3 publishes no provenance; its integrity and signature are checked. A failed
expected check stops the release. The package keeps every upstream license file, adds
`THIRD_PARTY_NOTICES.md` and `PROVENANCE.json`, and installs with no dependency resolution and no
install script on your computer.

The package declares macOS, Windows and Linux. Each platform counts as supported only after the
installed package passes acceptance on it.
