# Trace details panel redesign — round v1

Branch: `trace-details-panel-redesign` (worktree `.claude/worktrees/trace-details-redesign`)
Scope: visual-only restyle of ObservationDetailView + TraceDetailView (right-hand
panel on the trace page and in all table peeks) to the inspector design language
from the observation-inspector design handoff / session-redesign branch.

## Screenshot pairs (before = original design, after = redesign)

| # | View | Files |
|---|------|-------|
| 01 | Trace page, trace root selected | `01-before-trace-root.png` / `01-after-trace-root.png` |
| 02 | GENERATION selected | `02-before-generation.png` / `02-after-generation.png` |
| 03 | SPAN selected (format-reply) | `03-before-span.png` / `03-after-span.png` |
| 04 | TOOL selected (log-event) | `04-before-tool.png` / `04-after-tool.png` |
| 05 | Peek from traces table (GEN) | `05-before-peek.png` / `05-after-peek.png` |
| 06 | Dark mode, GENERATION selected | `06-before-dark-generation.png` / `06-after-dark-generation.png` |

(05-before has an unrelated `events.getSdkVersionInfo` dev toast in some runs —
pre-existing local-dev noise, not related to this change.)

## What changed (visual only)

- Header: colored `ItemBadge` icon → mono uppercase type chip (`GEN` / `SPAN` /
  `TOOL` / `EVENT` / full type name; `TRACE` for the trace root). GEN + TRACE get
  the slightly darker `bg-muted` fill, other types `bg-muted/40`.
- Name is now `text-sm font-bold` with the timestamp directly beneath it in
  mono 10px muted (was a separate `text-sm` row below the badges).
- Badge soup → overview metrics grid
  (`grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]`, eyebrow labels
  `text-[9px] font-bold tracking-[0.08em] uppercase font-mono`, mono 11px bold
  values, truncate + `title`). Rows render only when data exists:
  Latency, TTFT, Env, User ↗, Session ↗, Target Trace ↗ (LLM-judge traces),
  Cost ⓘ, Tokens ⓘ, Model, model params (one row per param), Prompt ↗,
  Release, Version, Level (colored when ERROR/WARNING), Status.
- BreakdownTooltip ⓘ affordances preserved on Cost and Tokens (click opens the
  same breakdown tooltip; verified in browser).
- Model row keeps both behaviors: linked → link to model settings; unlinked →
  `+` opens the create-model dialog.
- 8px zone-divider band (`bg-muted/60 h-2 border-y`) between the header zone and
  the tab chrome (replaces the plain `border-b`).
- Tab triggers (Preview / Scores / Log View) restyled to mono uppercase 11px;
  tab behavior, order, and visibility rules untouched.
- `DetailHeaderActionsMenu` (kebab) moved from next to the name into the
  right-side actions cluster (last position), matching the design's
  "kebab holds secondary actions" placement. Still visible in annotation mode.
- Entity links use trailing `↗` (ArrowUpRight) per the design language
  (previously `ExternalLink` inside badges).

## Not restyled / judgment calls

- **Scores** stay in the existing Scores tab (`ScoresTable`) — did NOT add the
  design's scores-rows-with-pills section to the panel body, since the panel
  already has a dedicated Scores tab and duplicating it would change
  information architecture, not just style.
- **Metadata accordion**: observation/trace metadata is rendered inside
  `IOPreview` (off-limits per constraints), so it keeps its current table
  rendering instead of the design's accordion.
- **Input/Output zones, Formatted/JSON/JSON-beta toggle, Beta switch,
  corrected output, tags, media, comments, annotate/dataset/queue/playground
  buttons**: untouched (IOPreview internals and action machinery are out of
  scope / behavior-frozen). The Formatted/JSON toggle chrome was left as-is —
  it is a shared `Tabs` primitive and already compact.
- Tokens row on non-usage observations can render as a bare ⓘ (no text) —
  same as the old `UsageBadge` behavior (icon-only badge), kept for parity.
- The old `*Badge` component names were kept (e.g. `LatencyBadge`) even though
  they now render grid rows, to keep the diff reviewable; they are only used by
  these two headers.

## Checks

- ESLint (11 changed files): clean, 0 warnings.
- `pnpm --filter web run typecheck`: exit 0.
- No colocated tests exist for the changed components (the `trace/components`
  tests cover tree-flattening/timeline utils, untouched).
