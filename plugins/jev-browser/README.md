# Jev Browser for Farero

Jev Browser runs one short task on a web page, in a separate Chrome or on a page of Farero's
browser. Jev, a model on TypeSafe, picks each click, dropdown choice and typed value from what is on
the page. The agent in your chat gives the goal and every exact text that the run may type.

This package is a Node port of [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) by
Browser Use (MIT). Farero maintains the port.

## What it can do

| Command | What it does | Needs a key | Sends data |
| --- | --- | --- | --- |
| `run` | Opens a URL in a separate Chrome with a new profile, or on a Farero browser page that the chat opened, and does one task there. | Yes | The goal, the values and the page text, to TypeSafe |

With the `chrome-hidden` and `chrome-window` settings, a run does these steps:

1. It starts Google Chrome with a new, empty profile in the run's scratch folder. Chrome has no
   window unless `browser` is `chrome-window`. Chrome takes commands only on a private pipe and
   opens no debugging port.
2. It loads the URL.
3. It reads the visible page and its controls. Then it asks Jev for the next operation and its
   target: a click, a dropdown choice, a text field with one of the supplied values, a scroll, a
   wait, done or blocked.
4. It checks that the page did not change since the read, and then does the action. An action that
   started is never repeated.
5. It repeats until Jev chooses done or blocked, a text is missing or a limit stops the run.
6. It prints one JSON result, closes Chrome and deletes the profile.

The `jev-browser` skill tells the agent when to use the command, how to write the goal and the
values, and how to check the result.

## On a Farero browser page

With the `farero` setting, no Chrome starts. The run works on one page of Farero's browser:

1. The agent opens the page with `browser_open` and passes its Desktop and tab in the `device` and
   `tab` inputs.
2. Farero gives the run a bridge to that page on standard input. The bridge works only while the
   run runs, only on that page, and only for five page tools: `browser_navigate`,
   `browser_snapshot`, `browser_click`, `browser_type` and `browser_select_option`. It acts as
   the chat that started the run, with the same checks as the chat's own browser calls. Each call
   shows in the chat's browser receipts.
3. The run loads the URL in the page. Then it reads the page with `browser_snapshot`, asks Jev for
   the next step, reads the page again, and acts only if the page did not change since the first
   read. While the page has no content yet, the run reads it again. After 15 seconds with no
   content, the run stops as `failed`.
4. It repeats until Jev chooses done or blocked, a text is missing or a limit stops the run. The
   page stays open, and the result comes from the last read of the page.

You can watch each step in the page. A step that the Desktop refuses, such as typing into a
password field, did nothing. The run then stops as `blocked` and names the field.

## Typed text comes only from the caller

Jev never writes text. Each typing option pairs one text field with one value from the `values`
input. For each text field, one yes-or-no question asks Jev if the goal needs text there that is
not in `values`. When the answer is 0.7 or more, the run stops before it types and names the field
(`needs_text`). The agent then gets the value and starts a new run.

Password, file and hidden inputs are never offered.

## Your key

You bring the key. Add it in Settings, Plugins, Jev Browser. Farero stores it encrypted and gives it
only to the `run` command, once per run, on standard input. It never goes into command arguments,
the environment, the output or the result. Saving a key makes no request and costs nothing. The
first run shows if TypeSafe accepts it.

## Where data goes

- **TypeSafe** (`api.typesafe.ai`), at each step: the goal, the values, the URL and title, the
  visible page text (at most 6,000 characters), the labels and values of the page's controls, and
  the last ten actions. A step on a short form uses about 3,000 input tokens. More text fields and
  more values make each step larger.
- **The sites**: Chrome or the Farero page loads the URL and the pages that it leads to, like any
  browser. A new Chrome profile can also contact Google services.
- **Farero's browser**, with the `farero` setting: each page read goes from your Farero Desktop to
  the run through Farero on this computer. Only what is listed under TypeSafe leaves the computer.

The result goes back only to your chat.

## Settings

| Config | Default | Range | What it does |
| --- | --- | --- | --- |
| `model` | `jev-1.13.0` | `jev-1.13.0`, `jev-latest` | The Jev model that picks each step. `jev-1.13.0` passed Farero's checks. `jev-latest` follows TypeSafe's newest model and can act differently. |
| `maxSteps` | 30 | 1 to 60 | Most browser actions in one run. |
| `browser` | `chrome-hidden` | `chrome-hidden`, `chrome-window`, `farero` | Where a run happens. `chrome-hidden` uses a separate Chrome with no window. `chrome-window` opens its window in the background; switch to Chrome to watch or interact with it. `farero` uses a page of Farero's browser that the chat opens, so you can watch each step. |

## Limits on each run

- At most `maxSteps` actions and twice as many Jev decisions.
- A TypeSafe request is sent again at most twice, only after HTTP 429, 503 or 529. No action runs
  until a valid answer arrives.
- The run stops itself after 12 minutes. Farero stops the command after 14 minutes.
- At most 50 values of at most 500 characters each, and at most 250 field and value pairs in one
  step. When a page has more text fields than the pairs allow, the run cannot type into the later
  fields.
- Three actions in a row that do not change the page stop the run.
- On a Farero page, each step is two page reads and one action, each through the Desktop. In
  Farero's check on a short form, a typing step took about 0.2 seconds and a click about 0.7
  seconds. There is no scroll step. Jev reads the whole page at once, and a click scrolls to its
  element, but content that loads only on scroll stays out of reach. A text field whose name looks
  like a password, a PIN or a code is never offered, and its value does not go to TypeSafe.
- The result holds at most 20,000 characters of page text. Farero caps each output stream at
  256 KiB.

These limits apply to what this command does. They are not an operating system sandbox, and your
TypeSafe billing is yours to check.

## Result and exit codes

stdout is one JSON object. stderr has progress lines.

```json
{
	"status": "done",
	"reason": "Jev chose DONE: every requirement is visibly satisfied.",
	"url": "http://localhost:5173/trip",
	"title": "Book a trip",
	"text": "Trip booked from Zürich to London.",
	"history": [
		{ "step": 1, "operation": "TYPE_TEXT", "target": "1:2", "action": "From", "kind": "fill", "text": "Zürich", "page_changed": true, "url": "http://localhost:5173/trip", "probability": 0.98, "confidence": 0.97, "missing_text": 0.01, "latency_ms": 150, "elapsed_ms": 160 }
	],
	"totals": { "decisions": 4, "actions": 3, "typesafe_requests": 4, "input_tokens": 12000, "output_tokens": 40, "wall_ms": 1700, "loop_ms": 1200 },
	"decision_latencies_ms": [150, 140, 160, 130],
	"model": "jev-1.13.0"
}
```

A `needs_text` result also has `field` (its `label`, `role` and `value`) and `missing_text`, the
highest yes-or-no answer.

| Code | Status | Meaning |
| --- | --- | --- |
| 0 | `done` | Jev chose done. This is Jev's claim: check `url`, `text` and `history` against the goal. |
| 1 | `failed` | Chrome, the Farero page, the page or TypeSafe failed, a step ended uncertain, or the decision budget ran out. |
| 2 | `blocked` | Jev chose blocked, the action budget or the time limit ran out, three actions changed nothing, or the Desktop refused a step. |
| 3 | `needs_text` | A text field needs a value that is not in `values`. |
| 64 | `failed` | An input is invalid, the `farero` setting got no page, or a Chrome setting got one. |
| 65 | `failed` | No key arrived on standard input. |
| 130 | `failed` | Stopped by SIGINT. |
| 143 | `failed` | Stopped by SIGTERM. |

Farero marks every nonzero exit as a failed ticket, and stdout still holds the result. The actions
in `history` happened, whatever the status. Farero never runs a task again on its own.

## Requirements

- macOS.
- For `chrome-hidden` and `chrome-window`: Google Chrome at `/Applications/Google Chrome.app`.
  Without it, the run fails with a reason that says so.
- For `farero`: a connected Farero Desktop and a page that the chat opened with `browser_open`.
- No dependencies and no build step. The command is TypeScript, `ai.farero/run.ts`, and Farero's own
  Node runs it directly. `ai.farero/package.json` marks the folder as ES modules, so Node never has to
  guess the module type from a `package.json` higher up on your disk.

## What v0.1 does not do

- Sign in in Chrome. Each Chrome run starts with a new profile, with no cookies.
- Uploads, downloads, CAPTCHAs and payments.
- Write text that the caller did not supply.
- Ask a question during a run. A missing text ends the run, and the next run starts again from the
  first page.
- Screenshots, recordings, or page text past 20,000 characters.
- Rules for which controls a run may use, blocks on card or one-time-code fields, and limits on the
  sites that a run may go to after the first page.
- Other browsers, Linux and Windows.

## Credit

`ai.farero/snapshot.js`, the action prompts and the in-page settle and hit-test scripts are copied
verbatim from jev-ultrafast (MIT, Copyright (c) 2026 Browser Use). The action loop in
`ai.farero/run.ts` is a TypeScript port of its Python agent. `ai.farero/THIRD_PARTY_NOTICES.txt` has
the notice.
