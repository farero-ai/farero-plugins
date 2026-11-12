# Farero plugins

This repository holds the source of the plugins in [Farero](https://farero.ai)'s plugin directory, and a starter for your own plugin. To install one of these plugins, open Settings in Farero and go to Plugins.

| Plugin | What it does | Recipe |
| --- | --- | --- |
| [Jevgrep](plugins/jevgrep/) | Ask a question about a repository and get the relevant files and source excerpts. Uses your own Jev provider key. | [npm](#how-each-archive-is-built) |
| [Jev Browser](plugins/jev-browser/) | For macOS: runs one short browser task in Chrome or Farero's browser. Jev picks each step; the goal, supplied values and page text go to TypeSafe on your key. | [Pack](#how-each-archive-is-built) |
| [Review panel](plugins/review-panel/) | A small code review panel with author-defined roles and a Workflow template that starts only when you choose it. | [Pack](#how-each-archive-is-built) |
| [pstack](plugins/pstack/) | Lauren Tan's pstack agent workflows: poteto-mode and its playbooks, skills to design, review, verify and explain code, 24 engineering principles, and roles for its helpers. | [Upstream](#how-each-archive-is-built) |
| [gstack](plugins/gstack/) | Garry Tan's gstack skills for Farero: the CEO, design, engineering and developer-experience plan reviews and the autoplan chain, pre-landing code review, ship, QA and design and documentation workflows, with roles and Workflow templates. Upstream text is unchanged; gstack's programs and browser daemon are left out. | [Upstream](#how-each-archive-is-built) |

Each plugin's README tells what the plugin does, what data it sends where, and which settings it has. [CREDITS.md](CREDITS.md) names the projects that these plugins adapt or bundle. `plugins/directory/entries.json` is the curated list that the directory shows, and `plugins/directory/listed.json` shows the version that it lists now.

## Releases

Each plugin version in the directory has a release here, tagged `<plugin>-v<version>`, for example `jevgrep-v0.8.5-farero.2`. The release holds the archive that Farero installs, byte for byte the file that the directory serves. It also holds `directory-index.json`, the signed directory index that lists the archive.

The tag holds the source of that version. The archive contains every file of `plugins/<plugin>/` at the tag, except `release/`. The release workflow checks this before it publishes a release. Releases here are immutable: after a release is published, its tag and its files stay as they are, and GitHub signs an attestation for them.

To check an archive that you downloaded:

```sh
gh release verify-asset jevgrep-v0.8.5-farero.2 jevgrep-0.8.5-farero.2.tgz
```

Farero also checks each plugin when you install it from the directory. It verifies the index signature, the sha256 of the archive and the closure digest of the package. Then it shows you the exact files, commands and data destinations, and installs the plugin only after you approve.

## How each archive is built

Farero's release pipeline builds each archive with one of three recipes. The files in the plugin's `release/` folder select the recipe.

| Recipe | Selected by | What it does |
| --- | --- | --- |
| Pack | No `release/` folder | `farero plugins pack` packs the folder as it is. The check workflow here packs each of these folders with a signed Farero release and compares the result with the release archive. |
| Upstream | `release/upstream.json` | `scripts/plugins/assemble-upstream.ts` downloads the upstream repository at the pinned commit and copies the selected files byte for byte. It refuses when they do not match the pinned tree digest. Then it adds their license texts, `THIRD_PARTY_NOTICES.md` and `PROVENANCE.json`. |
| npm | `release/sources.json` | `scripts/plugins/assemble-jevgrep.ts` installs the pinned npm packages without their install scripts. It checks their registry signatures and their provenance, and copies them into the package with their license texts. |

The two recipe scripts run in Farero's release pipeline. They use Farero's plugin packager, which this repository does not include.

## Write your own plugin

`starter/file-summary/` is the starter that `farero plugins init` writes. Its command summarizes a text file that the package bundles, and its skill tells the agent when to run that command. It needs no network access, key or dependency. Its README explains each file and how to try the plugin in Farero.

```sh
farero plugins init my-plugin
farero plugins validate my-plugin
farero plugins pack my-plugin --out my-plugin.tgz
```

The [plugin format reference](https://farero.ai/docs/plugin-format/) describes the manifest and the `ai.farero` extension.

## Changes and issues

Farero develops these plugins in its own repository and copies their source here each time it publishes the directory. To report a problem or propose a change, open an issue or a pull request. A maintainer makes an accepted change in Farero's repository, and the next publication brings it here.

## License

Farero's files in this repository are MIT licensed. See [LICENSE](LICENSE). Material from other projects keeps its own license, and [CREDITS.md](CREDITS.md) tells where each license text is.
