# TraceSidePanel consolidation — round v1

Branch `session-redesign`, commits `d9c6eddcb` (consolidation), `b6991772f`
(URL selection), `c738bd9b9` (copy rename). Seeded project
`7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`, sessions `session-shapes-s42-chat` and
`long-session-s42-session`.

Both observation-details surfaces now render one presenter,
`web/src/components/trace-side-panel/TraceSidePanel.tsx`:
- trace page/peek → `ObservationDetailView` adapter, `variant="full"`
- session inspector → `SessionObservationSidePanel` adapter,
  `variant="observation-only"`

## Pairs

- `01-before` / `02-after` — session inspector on a GENERATION.
  After: full overview grid (adds TTFT, temperature, version, prompt/level
  when present), shared toolbar (Formatted | JSON + Correct), IOPreview chat
  body instead of the bespoke flattened text, Scores + Metadata accordions
  unchanged. Note the `Correct •` dot: an existing correction is indicated
  but stays hidden until the toggle is clicked (register item 8). URL now
  carries `?inspectedTrace=…&inspectedObs=…` (item 4).
- `03-before` / `04-after` — trace peek on a GENERATION.
  After: the PREVIEW | SCORES tab bar is gone (Scores tab + ScoresTable
  removed, item 5); the tabs machinery collapsed into the slim toolbar.
  Scores stay available in the compact accordion below the I/O.

## Single "after" states

- `05` — session inspector JSON + Beta switch: the real advanced JSON viewer
  (search, jump-to, inline structure) now works in the session context
  (item 5; local ViewPreferences/JsonExpansion providers).
- `06` — "+ Add to" menu: observation actions + the session's trace-level
  actions (Add trace to dataset / Comment on trace) + "In N dataset(s)"
  links when present (item 6).
- `07` — annotation-queue chevron in the session inspector (item 6);
  toggling in/out of queues verified.
- `08` — kebab "Open Trace View" opens the peek AT the observation (items
  1/7); kebab also carries copy IDs + filter by name/type (events-table
  pivot works from the session URL) + web callout (hidden locally — no
  callout configured).
- `09`/`10` — dark mode, both surfaces.
- `11` — annotation-queue processor: annotation mode keeps its contract
  (no toolbar/overview, corrected output always visible, annotate pane).

## Verified flows (not screenshotted)

- Span-list row clicks (AGENT/GEN/TRACE turn header), conversation footer
  ("Turn N / … / Generation") and tool-call line clicks all open the
  inspector and mirror to the URL; reload restores the selection; Esc and
  the click-catcher close it and clear the params. Esc inside a Radix
  overlay (menu/drawer) closes only the overlay (defaultPrevented guard).
- Correct toggle opens the corrected-output editor with the existing value.
- Checks: `pnpm --filter web run typecheck` exit 0; eslint 0 problems on all
  changed files; `test-client src/components/session/` 34 passed.

## Known/pre-existing

- `events.getSdkVersionInfo` 500s locally (visible toast in some peek
  shots) — pre-existing on this dev stack, unrelated.
- Non-generation observations without I/O show `null`/`undefined`
  placeholder boxes in the inspector — this is the trace view's existing
  rendering, now shared (the old compact panel hid empty sections).
