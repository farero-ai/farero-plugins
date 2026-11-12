# Credits

Farero's own files in this repository are MIT licensed. See [LICENSE](LICENSE). Some plugins adapt or bundle the projects below, and each project keeps its own license. Farero maintains these plugins. The upstream projects do not support them.

## Jev Browser

Jev Browser is a Node port of [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) by Browser Use, MIT licensed, Copyright (c) 2026 Browser Use. `ai.farero/snapshot.js` is a verbatim copy, and `ai.farero/run.ts` keeps its prompts and in-page scripts. [`plugins/jev-browser/ai.farero/THIRD_PARTY_NOTICES.txt`](plugins/jev-browser/ai.farero/THIRD_PARTY_NOTICES.txt) names the upstream commit and holds the license text.

## Jevgrep

The Jevgrep plugin runs the unmodified npm release of [jevgrep](https://github.com/dzhng/jevgrep) by David Zhang, MIT licensed, Copyright (c) 2026 David Zhang. The archive also contains the npm packages that jevgrep needs, such as TypeScript (Apache-2.0) and web-tree-sitter (MIT). [`plugins/jevgrep/release/sources.json`](plugins/jevgrep/release/sources.json) pins each package with its license. Each release archive keeps every license text, and its `THIRD_PARTY_NOTICES.md` lists them.

## pstack

The pstack plugin contains [pstack](https://github.com/cursor/plugins/tree/main/pstack) by Lauren Tan, MIT licensed, Copyright (c) 2026 Lauren Tan. Its recipe copies pstack's skills and agent texts byte for byte from the commit that [`plugins/pstack/release/upstream.json`](plugins/pstack/release/upstream.json) pins. Each release archive keeps the license text in `licenses/`, and its `THIRD_PARTY_NOTICES.md` lists every upstream file.

## gstack

The gstack plugin contains [gstack](https://github.com/garrytan/gstack) by Garry Tan, MIT licensed, Copyright (c) 2026 Garry Tan. Its recipe copies gstack's skills byte for byte from the commit that [`plugins/gstack/release/upstream.json`](plugins/gstack/release/upstream.json) pins. gstack includes material from other projects under their own licenses. Each release archive keeps gstack's license, its `NOTICE.md` and those licenses in `licenses/`.

## Review panel and the starter

The review panel and `starter/file-summary/` are Farero's own work.
