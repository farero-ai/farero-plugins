---
name: review-panel
description: Run a small code review with separate reviewers when the person asks for a review panel, a second opinion on a change, or an independent check before merging.
compatibility: The panel uses Farero's managed delegation and package roles. Other clients can read this text but cannot start the panel.
---

# Review panel

Use the Review panel package roles to review a change with more than one reviewer.

- `review-panel/reviewer` reviews the change for correctness.
- `review-panel/skeptic` runs on a different model. It tests the reviewer's findings and looks
  for what the reviewer missed.
- `review-panel/lead` splits the work and merges the results.

To run the full panel as a managed Workflow, the person starts the Review panel template from
Farero. Installing this package never starts it. Inside a chat, delegate to the reviewer and the
skeptic with tracked assignments, give each the exact files and base, and keep only findings
that name an input, the wrong result and the line that causes it.

The Interface checker role needs host browser access. When it is unavailable, run the panel
without it and say that the screens were not checked.
