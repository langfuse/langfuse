# Observation Inspector — round 1 (v1)

Branch: `session-redesign` (worktree). Implements the
`design_handoff_observation_inspector` brief: a 420px right-hand inspector
panel in the Compact Session View (modernSession flag) that opens when
clicking an observation in the conversation feed — replacing the full trace
peek for that interaction. The trace peek is unchanged and still reachable
(trace header / minimap click, and kebab → "Open in trace view").

## Pairs

- `00-context-modern-session-feed.png` — compact session view, panel closed.
- `01-before-trace-peek.png` / `01-after-inspector-open.png` — what clicking
  a turn used to open (full-screen trace peek) vs. the new in-place inspector
  (GEN observation: type badge, name, mono timestamp, overview grid with
  latency/env/user/session/cost ⓘ/tokens ⓘ/model, Input, System prompt
  collapsible, Output + Correct, Scores accordion, Metadata accordion).
- `02-before-observation-details-in-peek.png` /
  `02-after-system-prompt-metadata-expanded.png` — old observation details
  panel vs. inspector with System prompt + Metadata expanded.
- `03-after-add-to-menu.png` — "+ Add to ▾" menu (dataset / annotate / comment).
- `04-after-kebab-menu.png` — kebab (open in trace view, copy IDs).
- `05-after-correct-editor.png` — Correct (GEN only) reveals the corrected
  output editor (reuses CorrectedOutputField incl. JSON toggle + diff).
- `06-after-tool-observation.png` — TOOL observation: type-aware grid (no
  cost/tokens/model, no Correct).
- `07-after-long-output-collapsed.png` / `08-after-long-output-expanded.png`
  — 10-line output cap with centered "Show N more lines ⌄" / "Show less ⌃".
- `09-after-annotate-drawer.png` — "+ Add score" opens the dual annotation
  drawer (observation + trace scores).
- `10-after-score-pill.png` / `11-after-scores-collapsed-peek.png` — score
  rows with neutral value pills; collapsed accordion peek chips (`name:value`).
- `12-after-add-to-dataset-dialog.png` — Add to dataset dialog (reuses
  NewDatasetItemForm) opened from the menu.
- `13-after-dark-mode.png` — dark mode (left shadow dropped, tokens adapt).

## Design mapping decisions

- Colors/typography mapped to existing DS tokens (`bg-background`, `bg-muted`,
  `border`, `text-muted-foreground`, `font-mono`); no raw greys from the mock.
  2px-radius spec mapped to `rounded-sm`; score pills `rounded-full`.
- No scrim: transparent click-catcher over the session area; Esc and ✕ close.
  Esc is ignored while a child overlay (menu/dialog/drawer) is open.
- Overview grid rows are data-driven and type-aware: cost row hidden for
  zero-cost non-generations; Correct strictly GENERATION.

## Known gaps (round 2 candidates)

- Score pills read from the cached `tracesFromEvents` query — a score added
  via the drawer appears after refetch/reload, not instantly.
- "N available tools not called" row untested visually (seeded data carries no
  tool definitions); logic mirrors the trace view's ChatML parser.
- Output renders mono plain text; markdown (lists/tables/code) not yet.
- Media attachments (images/audio) degrade to text/JSON.
- PostHog event `session_detail:observation_inspector_open` added.
