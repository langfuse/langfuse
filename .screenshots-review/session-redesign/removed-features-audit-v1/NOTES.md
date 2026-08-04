# Removed / moved UI audit — session detail redesign (PR #15346)

Element-zoomed before/after screenshots of every UI component removed or moved
by the Compact Session View redesign.

- BEFORE: PR base `b316fabf3` served at localhost:3009 (worktree `.claude/worktrees/session-before`)
- AFTER: branch `session-redesign` served at localhost:3000
- Test session: `/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/sessions/session-shapes-s42-chat`
- Peek shots use `?peek=session-shapes-s42-chat-t0&observation=session-shapes-s42-chat-t0-o1`
- All shots are Playwright element/clipped screenshots (device scale), logged in as demo@langfuse.com
  with the Compact Session View preview enabled.

## Item map

| # | Before (old UI) | After (new UI) | Status |
|---|---|---|---|
| 01 | `01-before-llm-presets.png` — toolbar "LLM Calls per Trace" preset button + open popover (First/Last LLM Call) | `01-after-generations-control.png` — Generations All/First/Last segmented control on the metrics line | moved |
| 02 | `02-before-my-views-trigger.png` — "My Views" saved-view drawer trigger | — | removed, no equivalent |
| 03 | `03-before-filter-builder.png` — "Filter observations" builder button + open popover (Has Input/Has Output rows) | `03-after-span-rail-search-funnel.png` — span-rail free-text search + type funnel (builder itself dropped) | moved (reduced) |
| 04 | `04-before-options-menu.png` — Show: Options popover with corrections / tool calls / system prompt switches | — | removed, no equivalent (system prompt is a collapsible in the inspector; global toggles gone) |
| 05 | `05-before-minimap-trace-card.png` — minimap trace card with timestamp + id + observation count + scores | `05-after-turn-card-rail.png` (minimal turn card) + `05-after-trace-inspector.png` (trace inspector opened on card click shows timestamp/id/spans/scores); `05b-after-observation-inspector.png` shows the observation-level variant | moved |
| 06 | `06-before-active-minimap-card-actions.png` — active minimap card with Add to datasets / Annotate / Add comment buttons | `06-after-add-to-menu.png` — inspector "+ Add to" menu (dataset, annotate, comment, incl. trace-scoped items) | moved |
| 07 | `07-before-header-icon-trio.png` — header star / publish / copy-id icon trio | `07-after-session-kebab-menu.png` — session kebab menu (favourites, share, copy ID, download JSON) | moved |
| 08 | `08-before-detailnav-arrows.png` — DetailPageNav outline arrow buttons (↑K ↓J) | `08-after-ghost-prev-next.png` — ghost "Prev K / Next J" labeled links | moved (restyled) |
| 09 | `09a-before-traces-cost-badges.png` (Traces · 8 / Total cost badges) + `09b-before-user-score-chips.png` (User ID + score chips row) | `09-after-metrics-line-user-scores.png` — single metrics line (Traces/P50/Tokens/Cost/User) + score chips | moved |
| 10 | `10-before-sticky-trace-header.png` — sticky trace header inside the conversation feed | `10-after-headerless-turn.png` — headerless conversation turn (metadata chip on hover/footer) | moved |
| 11 | `11-before-peek-details-header.png` — old peek observation details header (badge soup + button row) | `11-after-peek-details-header.png` — redesigned peek header (grouped CTAs + label/value grid) | moved |

Dropped with no after-equivalent: My Views drawer (02), filter builder popover
(03 — only search + type funnel remain), Options toggles for corrections/tool
calls/system prompt (04), the "with input/output" viewId preset, and inline
corrections display in the feed.
