# Search Bar (Observations v4)

Grammar-based query bar for the observations (v4 events) table. It does NOT
replace the facet sidebar — it is an ADDITIONAL keyboard-driven editor that
coexists with the sidebar and stays in sync with it (Datadog model). The facet
sidebar's `FilterState` (+ the table's full-text search) remains the single
source of truth; the bar reads from and writes to it. Only the legacy toolbar
search field is replaced (free text + `in:` scopes go inline in the bar).
Project-level opt-in. Based on the `langfuse-search-bar` prototype.

## Enablement

- Project settings → General → "Filter Search Bar (Beta)" switch, gated by
  `project:update` (admins/owners). Stored as `searchBarEnabled` in
  `Project.metadata` (`server/searchBarRouter.ts`); read from the session via
  `hooks/useSearchBarEnabled.ts`.
- `EventsTable` activates the bar only when the flag is on and the table is a
  full page surface (`!hideControls && !externalFilterState && !peekContext`).
  Default off — zero changes for projects that do not opt in.

## Query language

`key:value` filters AND-joined, mirroring exactly what the flat
`FilterState` contract can express today:

- `level:(ERROR OR WARNING)` any-of, `-env:dev` none-of,
  `tags:(a AND b)` array all-of
- `latency:>2`, `startTime:>2026-06-01` comparisons
- `name:~chat` contains, `:=` exact, `:^` starts-with, `:$` ends-with
- `metadata.region:eu`, `scores.accuracy:>0.8`, `traceScores.nps:positive`
- `has:endTime` / `-has:endTime` null checks
- free text → `searchQuery`; `in:id|content|input|output` → `searchType`

Cross-field OR, negated groups, and other shapes the flat contract cannot
represent are commit-blocking diagnostics, not silent drops. There is no
FTS `*` operator: the events tRPC filter contract has none; full-text search
is free text + `in:` scopes.

## Data flow (one source of truth, one direction)

The table's URL filter state — `FilterState` (the `filter` param, owned by the
facet sidebar's `useSidebarFilterState`) plus `searchQuery`/`searchType` (the
`search`/`searchType` params, owned by `useFullTextSearch`) — is the **single
source of truth**. The bar is a *controlled editor* over it; the facet sidebar
is another. Neither stores a second copy.

```
URL filter state (FilterState + searchQuery/searchType)   ← single source
   │  filterStateToQueryText  (pure, derived)
   ▼
committedText ──resetTo──▶ store.draft ──(type/pick/remove)──▶ draft
   ▲                                                             │ planCommit (pure)
   └──────────── setFilterState / setSearchQuery ◀── commit() ◀──┘
```

- The committed query text is **derived** from the source, never stored.
- The bar's only persistent local state is the **draft** (the edit buffer).
- There is exactly **one effect** (`resetTo` when the derived committed text
  changes) and it never writes back, so the cycle cannot loop. No
  reconciliation signature, no two-way sync — a commit's own echo settles
  because `resetTo` no-ops when the draft already matches.
- This mirrors the prototype's ADR-006 ("URL is canonical; everything derives
  from it") and "no write loops".

## Ownership map

- `lib/` — pure logic, no React/DOM. `qlang.ts` (tolerant lexer/parser +
  canonical serializer), `ast.ts`, `fields.ts` (field registry +
  operator-validity table mirroring `eventsTableCols`), `validate.ts` (commit
  gate; parity with the adapter by construction), `adapter.ts`
  (AST → flat `FilterState` + searchQuery/searchType), `commit.ts`
  (`planCommit`: the pure validate+lower gate that turns draft text into
  applied filter state), `filter-state-to-query.ts` (reverse: applied state →
  committed text — the derive direction), `completions.ts` (pure completion
  planner), `composer-segments.ts` (draft text → renderable token segments),
  `edits.ts` (span-local chip removal with AST-surgery fallback),
  `observed-options.ts` (filterOptions → per-column observed values).
- `store/searchBarStore.ts` — per-mount vanilla zustand store, **draft only**
  (`setDraft`/`resetTo`/`removeChipSpan`/`revealInvalid`). No committed copy,
  no commit workflow. Provided with the container's `commit` via
  `store/SearchBarStoreProvider.tsx` (`useSearchBarStore` selector,
  `useSearchBarCommit`).
- `hooks/useEventsSearchBar.ts` — the container/bridge. Derives `committedText`
  (memo), runs the one `resetTo` effect, and owns the `commit()` workflow
  (planCommit → write filter state + record recent). No URL param of its own;
  no signature guard.
- `components/`:
  - `SearchComposer.tsx` — the stateful contenteditable CONTROLLER: browser
    owns selection, mutations flow through `beforeinput`, undo/redo/caret/
    autocomplete state. Picking a value advances to "append next"; ArrowRight
    at the end of the query exits the last token.
  - `ComposerTokens.tsx` — **presentational** (pure, prop-driven): draft text →
    styled token spans. `cva` token variants. Story: `ComposerTokens.stories`.
  - `AutocompleteListbox.tsx` — **presentational** ARIA listbox over a
    `CompletionPlan`. Story: `AutocompleteListbox.stories`. `AutocompletePopover`
    only positions it.
  - `EventsSearchBarRow.tsx` (full-width composer, sticky),
    `EventsHeaderControls.tsx` (time range + refresh, portaled into the page
    header), `SearchBarSettings.tsx` (settings card).

## Integration (EventsTable)

The table always reads the sidebar's `effectiveFilterState` +
`searchQuery`/`searchType` — unchanged from non-bar mode. The events table is
mounted by both `/observations` and `/traces` in v4 mode (and embedded with
`hideControls` on user/session pages, where the bar stays off). In bar mode the
toolbar's legacy search field is hidden (free text + `in:` scopes are inline in
the bar); the time-range/refresh controls (`EventsHeaderControls`) render into
the page header when the host page provides a header-actions slot
(`actionButtonsRight` with a callback-ref DOM node), and **fall back to inline
beside the bar** when it does not — so they are never dropped if a page forgets
the slot. The facet sidebar, view drawer, filter toggle, and AI filter all
stay. Because both the bar and the sidebar are
controlled editors over the same source, they reflect each other with no
explicit sync. Saved views write through `setFilterState`, so they flow into
both surfaces. Order is preserved _within_ each category — filter-to-filter
order and within-free-text order survive the AST/serializer and URL
encode/decode round-trip. The flat URL contract (`FilterState` + `searchQuery`
+ `searchType` as three separate params) has no slot for the relative position
of filters vs free text, so on commit the reverse adapter canonicalizes to
`<filters> [in:scope] <freetext>` (Datadog-style): typing `refund level:ERROR`
and pressing Enter re-renders the bar as `level:ERROR refund`. The typed
interleave is preserved only in the recent-searches entry (`planCommit`'s
`canonical`), not in the live bar.

## Next slices

- Pill click-to-edit (value switcher dropdown on filter tokens).
- Saved-view round-trip for free text/search scopes.
- Optional: extract `SearchComposer`'s contenteditable selection/`beforeinput`
  machinery into a `useContentEditableController` hook to fully separate the
  imperative integration from the React component.
