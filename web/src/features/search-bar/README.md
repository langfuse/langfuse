# Search Bar (Observations v4)

Grammar-based query bar for the observations (v4 events) table. It does NOT
replace the facet sidebar — it is an ADDITIONAL keyboard-driven editor that
coexists with the sidebar and stays in sync with it. The facet
sidebar's `FilterState` (+ the table's full-text search) remains the single
source of truth; the bar reads from and writes to it. Only the legacy toolbar
search field is replaced (full-text search goes inline in the bar).
Generally available on the v4 events tables (no opt-in). Based on the
`langfuse-search-bar` prototype.

## Enablement

- **Generally available on the v4 events tables** — every user gets the bar; it
  is no longer a per-user Feature Preview opt-in. `hooks/useSearchBarEnabled.ts`
  now returns `true` for everyone, so the bar renders wherever the v4 events
  table does.
- `EventsTable` activates the bar when the table is a full-page surface
  (`!hideControls && !externalFilterState && !peekContext && !userId && !sessionId`).
  The **v4 beta** gate is implicit: `EventsTable` only mounts on the v4
  Observations/Traces tables, so call sites still read as
  `isBetaEnabled && useSearchBarEnabled()`.
- **Rollout/rollback (temporary).** GA was shipped by force-on shim, not by
  deleting the opt-in: `useSearchBarEnabled` hard-returns `true` and the
  "Filter Search Bar" tile was removed from the Feature Preview modal, but the
  `searchBar` flag plumbing is intentionally **left as dead code** for a day or
  two so a rollback is a one-line revert. The pieces still present and marked
  `TODO(remove ~2026-06-19)`: the `searchBar` entry in
  `features/feature-flags/available-flags.ts`, the
  `userAccount.setFeaturePreviewEnabled` allowlist, and the modal's
  `PreviewFlag`/registry entry (`features/feature-previews/`). Once the rollout
  is confirmed stable, delete those and inline `true` at the call site.

## Query language

`key:value` filters AND-joined, mirroring exactly what the flat
`FilterState` contract can express today:

- `level:(ERROR OR WARNING)` any-of, `-env:dev` none-of,
  `tags:(a AND b)` array all-of
- `latency:>2`, `startTime:>2026-06-01` comparisons
- text match via positional `*` globs (shown on a textSearch field, where the
  bare form defaults to contains): `statusMessage:*chat*` contains,
  `statusMessage:chat*` starts-with, `statusMessage:*chat` ends-with,
  `statusMessage:chat` bare (contains default), `statusMessage:=chat` exact
  (quote a literal `*`, e.g. `statusMessage:"a*b"`). `name:`/`id:` work the same
  way (bare = contains, `:=` = exact) but still suggest observed values.
- `metadata.region:eu`, `scores.accuracy:>0.8`, `traceScores.nps:positive`
- dot-path names with spaces/grammar chars are **quoted after the prefix**:
  `scores."Rouge Score":>=1`, `traceScores."Hallucination Check":faithful`,
  `metadata."my key":eu` (the quotes are stripped to the real key when lowering;
  the reverse adapter and completions re-quote them — so they round-trip)
- `has:endTime` / `-has:endTime` null checks
- full-text search (see below): bare text, or `input:`/`output:`/`name:`/`id:`

Cross-field OR, negated groups, and other shapes the flat contract cannot
represent are commit-blocking diagnostics, not silent drops. There is no
FTS `*` operator: the events tRPC filter contract has none.

**Full-text search.** It matches as a **contiguous substring** server-side
(`clickhouse-sql/search.ts`, `ILIKE %query%`) and is expressed field-style:

- **bare text** (`refund policy`) → `searchQuery`, default scope:
  `searchType=['id','content']` — i.e. `id` + `user_id` + `name` (the `id`
  lane) **and** `input` + `output` (the `content` lane). Typing plain text
  searches all of them. The adapter emits a `null` searchType (no scope token);
  `commit.ts`'s `DEFAULT_SEARCH_TYPE` supplies `['id','content']`.
- **`input:"refund"` / `output:"refund"`** → real `string` "contains" **column
  filters** on `e.input`/`e.output` (not `searchType`). Use them to narrow the
  search to one payload channel. They round-trip as `FilterState` like any
  other column filter, and support operators (`:=`, `*`/glob, `-` negation).
- **`name:"checkout"` / `id:"abc"`** → `string` "contains" column filters on
  `name`/`id`. Use them to narrow to that column. They are `textSearch` fields
  (bare = contains, `:=` = exact) but keep their observed-value autocomplete.

Typing bare text offers the scope rewrites (`input:`/`output:`) with hover
explanations. Scope is global per query (`searchType` is one value), so
multi-word free text is a **phrase**, not token-AND — `test media` matches
"Test Media" but not "Media — Test run" (open Decision A below).

Historical note: the old `in:<scope>` token and the `content:` pseudo-field are
both **gone**. `content:` searched input + output combined; that is now simply
the default (a bare query already searches both), so the token was removed (the
one capability it uniquely had — "payloads but NOT ids/names" — is dropped,
pending feedback). The reverse adapter canonicalizes a legacy
`searchType=input|output` to the `input:`/`output:` **column filter** on the
next commit (the chosen normalization), and treats any `id`/`content` searchType
as the default — rendered as bare text, no token.

**Known limitation (multi-scope legacy state).** The bar's scope is a single
value per query; the legacy toolbar's `searchType` was a _set_. `['id','content']`
now round-trips losslessly — it **is** the default, rendered as bare text. The
two remaining multi-scope states still drop their id channel on the next commit:
`['id','input']` / `['id','output']` canonicalize to `input:"…"` / `output:"…"`
**column filters** (per the historical note above) and drop the id-scope
`searchType`/`searchQuery`. There's no lossless single-token projection of those
two without a real per-column "all fields" scope — deferred past beta. Trigger is
narrow (a legacy URL from the old dropdown + the bar enabled + a commit).

Operator-looking tokens that aren't supported yet are **reserved** — they emit
an explicit "not supported yet" diagnostic instead of silently becoming free
text: `!`, lowercase `not`/`or`/`and` (use `-field:value` to exclude;
`field:(A OR B)` for one field's values). Quote a reserved word (`"or"`) to
search for it as literal text. (Top-level grouping with `(` `)` is tracked as a
follow-up.)

## Data flow (one source of truth, one direction)

The table's URL filter state — `FilterState` (the `filter` param, owned by the
facet sidebar's `useSidebarFilterState`) plus `searchQuery`/`searchType` (the
`search`/`searchType` params, owned by `useFullTextSearch`) — is the **single
source of truth**. The bar is a _controlled editor_ over it; the facet sidebar
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

## Invariants (don't break these)

- **No silent drops or rewrites.** Every filter is either rendered in the bar,
  preserved untouched via `skippedFilters` (shapes the grammar can't express —
  `positionInTrace`, single-value `all of`), or a commit-blocking diagnostic.
  Never silently dropped, reordered into a different filter, or rewritten.
  (Score/metadata keys with grammar chars are no longer skipped — they render
  with a quoted segment, `scores."Rouge Score"`, and round-trip.)
- **validate ↔ lower parity, across _every_ site.** `draftValid` (store),
  token classification (`deriveComposerSegments`), and the commit gate
  (`planCommit` → `validateQuery` + `astToFilterState`) must all lower with the
  **same `scoreTypes`** context. If they diverge, the red-state gate (which
  reads `draftValid`) disagrees with the commit gate and Enter silently no-ops.
  This regressed twice — `scoreTypes` is now threaded through all three.
- **Negation is not a primitive.** `-`/`NOT` lower to existing inverse
  operators (`none of`, `does not contain`, `is null`) or flip a comparison /
  boolean. Anything without a native inverse is a diagnostic (`fields.ts`
  `negationIssue` is the spec) — the backend has no general NOT. (Negated exact
  on a `textSearch` field — `-name:=v` — is representable: it lowers to a
  `stringOptions none of`, the exact-inequality form the facet emits when one
  value is unchecked. It is NOT `does not contain`.)
- **User-authored filters are never auto-removed.** The bar reads the sidebar's
  **explicit** `FilterState`, so the managed-environment implicit default
  (`environment none of [hidden internal envs]`, derived into _effective_ state
  by `features/filters/lib/managedEnvironmentPolicy.ts`) never shows as a token.
  That policy strips exactly one shape from explicit state — that same implicit
  `none of [hidden]` default (which the facet also re-creates on "clear back to
  default"). A user-authored positive selection (`environment:default`, typed or
  saved) is kept explicit even when it equals the current default set; the user
  returns to the default by removing the filter, never by us inferring it.

## Ownership map

- `lib/` — pure logic, no React/DOM. `langQ.ts` (tolerant lexer/parser +
  canonical serializer), `ast.ts`, `fields.ts` (field registry +
  operator-validity table mirroring `eventsTableCols`), `validate.ts` (commit
  gate; parity with the adapter by construction), `adapter.ts`
  (AST → flat `FilterState` + searchQuery/searchType), `commit.ts`
  (`planCommit`: the pure validate+lower gate that turns draft text into
  applied filter state), `filter-state-to-query.ts` (reverse: applied state →
  committed text — the derive direction), `completions.ts` (pure completion
  planner), `composer-segments.ts` (draft text → renderable token segments),
  `edits.ts` (span-local chip removal with AST-surgery fallback),
  `observed-options.ts` (filterOptions → per-column observed values),
  `searchBarInvariants.ts` (pure, registry-shaped property-test harness — the
  universal safety net reused per view; see Hardening).
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
    autocomplete state. **Trailing space is the "start the next filter"
    affordance, applied uniformly.** The RESTING draft carries a trailing space
    when non-empty: it is baked into the URL→draft derivation
    (`useEventsSearchBar`'s `restingDraft`, also returned by `commit`), so it is
    present from the first paint. That is why clicking past the text — or landing
    after a commit — never has to MUTATE the draft to insert it (which flickered
    the caret from inside the last pill to after a freshly-added space); the
    caret just lands after the already-present space. Completing a filter at the
    end of the query — a pick-at-end (value or ready-to-run suggestion),
    ArrowRight-at-end, a click past the text, or Enter that commits with the
    caret at the end — leaves the caret AFTER that trailing space (outside the
    last pill), reopening field suggestions. (The space is trimmed on commit, so
    it never reaches the filter state; the commit echo's `resetTo` no-ops because
    it's AST-equal to the committed form.) Picks that still need input — a bare
    `field:` key, a `metadata.`/`scores.` prefix, an open `tags:(` group — and
    mid-query edits keep the caret in place instead. Paste inserts cleaned text
    (line-breaks/tabs → spaces) into the draft, which auto-tokenizes like typed
    text — there is no special structured-vs-raw paste branch. Editing a
    value works by placing the caret in it (click/arrow): the value-stage
    popover then offers that field's values with the current one active.
  - `ComposerTokens.tsx` — **presentational** (pure, prop-driven): draft text →
    styled token spans. `cva` token variants. Story: `ComposerTokens.stories`.
  - `AutocompleteListbox.tsx` — **presentational** ARIA listbox over a
    `CompletionPlan`. Story: `AutocompleteListbox.stories`. `AutocompletePopover`
    only positions it.
  - `EventsSearchBarRow.tsx` (full-width composer; `EventsTable` owns the
    sticky stack around the composer + toolbar). The time-range + refresh
    controls live in the toolbar row below the composer (next to the filter
    toggle and views), via `DataTableToolbar`'s `timeRange`/`refreshConfig`
    props — same as non-bar mode, not in the page header. The bar is now GA on
    the v4 tables, so there is no enablement toggle (the retired Feature Preview
    tile lived in `features/feature-previews/`; see Enablement above).

## Integration (EventsTable)

The table always reads the sidebar's `effectiveFilterState` +
`searchQuery`/`searchType` — unchanged from non-bar mode. The events table is
mounted by both `/observations` and `/traces` in v4 mode (and embedded on the
user/session detail pages — page-scoped by `userId`/`sessionId` — and the
evaluator form via `hideControls`, where the bar stays off). In bar mode the
toolbar's legacy search field is hidden (full-text search is inline in the
bar); the time-range + refresh controls stay in the toolbar row (next to the
filter toggle and views), exactly as in non-bar mode — `EventsTable` passes
`timeRange`/`refreshConfig` to `DataTableToolbar` in both modes. The facet
sidebar, view drawer, filter toggle, and AI filter all
stay. Because both the bar and the sidebar are
controlled editors over the same source, they reflect each other with no
explicit sync. Saved views write through `setFilterState`, so they flow into
both surfaces. Order is preserved _within_ each category — filter-to-filter
order and within-free-text order survive the AST/serializer and URL
encode/decode round-trip. The flat URL contract (`FilterState` + `searchQuery`

- `searchType` as three separate params) has no slot for the relative position
  of filters vs free text, so on commit the reverse adapter canonicalizes to
  `<filters> <freetext>`: typing `refund level:ERROR`
  and pressing Enter re-renders the bar as `level:ERROR refund`. The typed
  interleave is preserved only in the recent-searches entry (`planCommit`'s
  `canonical`), not in the live bar.

## Extending to other views (the universality contract)

The bar is intended to become the primary filter interface for **every**
filterable view, not just the v4 events table. That is cheap _by design_ — but
only if new views extend it through the seam below instead of forking the
grammar. Read this before adding a second view.

**Why it's cheap: the back half is already universal.** Langfuse has ~15
filterable views (traces, sessions, observations, events v4, scores, prompts,
users, monitors, evaluators, eval-logs, experiments, experiment-items,
datasets…). Every one of them already rides ONE pipeline:

```
ColumnDefinition[]   (per view — packages/shared/src/tableDefinitions/*,
   │                  web/src/features/filters/config/*)
   ▼
flat FilterState     (singleFilter — packages/shared/src/interfaces/filters.ts)
   ▼
createFilterFromFilterState → ClickHouse
   (packages/shared/src/server/queries/clickhouse-sql/factory.ts)
```

The bar's adapter emits that **same `FilterState`** (see the `fields.ts` header:
"the adapter never emits a filter shape the sidebar could not produce"). So the
lowering, the URL contract, and the facet sidebar are **already shared** with
the bar. The only thing forked per view is the **front half**: the field
registry + grammar + value validation. Keep it that way.

**The seam to open before the 2nd view.** Today `FIELDS` is a module-level const
hardcoded to `eventsTableCols`, and `resolveField`/`operatorIssue` close over
it. Multi-view requires making the registry an **injected parameter** of the
grammar — parser, validator, adapter, and completion planner take a
`FieldRegistry` instead of importing the const. This is the one structural
refactor; everything after it is data, not code.

**Recipe to add the bar to a view:**

1. **Derive the field registry from that view's `ColumnDefinition[]`** — do NOT
   hand-author a second 47-entry list. ~70% is mechanical: `type → kind`
   (`number`/`datetime`/`boolean` map directly, everything else → `text`),
   `nullable`, `options → observed values`, `unit`. Write a
   `fieldRegistryFromColumns(cols)` helper.
2. **Add a thin per-view grammar overlay** for what `ColumnDefinition`
   deliberately does not carry (it is a UI/SQL contract, not a grammar):
   user-facing **aliases** (`env`, `tags`, `ttft`), **dot-path roots**
   (`metadata.`, `scores.`/`traceScores.` and their score columns), and
   **value-parse hints** (datetime ISO, numeric, boolean). Keep it small and
   declarative.
3. **Reuse the view's `filterOptions` tRPC** for observed values —
   `observed-options.ts` already maps that payload to per-column observed
   values; point it at the new view's procedure (do not invent a parallel one).
4. **Keep the adapter targeting the shared `FilterState`.** Reuse the
   already-registry-driven `operatorIssue`/`negationIssue` and the existing
   per-kind lowering. Never add a second lowering path — that breaks the
   universality and re-opens the validate↔lower parity drift.
5. **Per-kind handlers, not per-field branches.** The recurring parity
   regressions came from a kind's _validate_ half (`validate.ts`) and _lower_
   half (`adapter.ts`) living apart. New value kinds should add a single handler
   that owns both, so the two cannot drift.
6. **Add the round-trip property test for the new registry** (see Hardening) —
   run it per registry. This is the universal safety net across views.

**What stays grammar-global — do not make per-view:** tokenizing, quoting
(`serializeValue` ↔ `reservedTokenIssue` is a **mirror invariant**: add a
reserved token to one, add it to the other, or the round-trip test fails),
operator precedence, and the `has:` pseudo-field. These are language, not
data — a new view inherits them unchanged.

**Do not couple to `ColumnDefinition` speculatively.** Build the derivation +
overlay when the first real second view lands, validated against that consumer —
not ahead of it (the same no-half-finished rule that removed the prototype's
unused planners).

## Hardening before default-on

- **Round-trip property test — implemented as a reusable harness**
  (`lib/searchBarInvariants.ts`, wired per view in
  `lib/searchBarInvariants.clienttest.ts`). The `FilterState ⇄ text` boundary
  (reverse adapter ↔ parse/lower) is where almost every correctness bug landed,
  so this is a deterministic matrix (fields × operators × adversarial values ×
  scoreTypes contexts, no new dep) checking three invariants that have each
  regressed in this PR's history:
  - **INV-1 commit-gate parity** — `validateQuery(text).valid === true` implies
    the commit-time lowering (`astToFilterState`) produces no errors. (The
    `6e84fe4`/`32215fb` class: validate clean while lower errored → empty filter
    set committed silently.)
  - **INV-2 no silent drop/rewrite** — `FilterState → text → FilterState` is
    stable: every filter round-trips unchanged or is reported in
    `skippedFilters`; none is rewritten into a different filter.
  - **INV-3 serialize ↔ parse symmetry** — a free-text value always re-parses to
    itself and stays valid. (Catches the `serializeValue`/`reservedTokenIssue`
    mirror-invariant drift — a bare reserved token like `or`/`!important` that
    the parser rejects. Verified to fail when that fix is reverted.)

  The harness is **pure and registry-shaped**: it generates the matrix from the
  passed `view.fields`, so it auto-covers added/changed fields, and a second
  filterable view gets the same coverage by adding one block to the
  `.clienttest.ts` with its registry — see "Extending to other views". When the
  grammar is parameterized over an injected registry, thread `view.registry`
  into the harness's parse/validate/lower calls; the generators and assertions
  do not change.

- **`SearchComposer` (~1.3k LOC) has no unit tests** — the contenteditable
  controller is browser-reviewed only. Extracting the selection/`beforeinput`
  machinery into a hook (below) is the prerequisite to testing it.
- **No e2e** for bar↔sidebar sync or the embedded-vs-full-page mount matrix
  (the bar leaking onto user/session detail was a review find, not caught by a
  test).

## Next slices

- Pill click-to-edit: a dedicated value-switcher dropdown anchored to a
  _selected pill_. (Editing a value already works by placing the caret in it —
  see SearchComposer; only the pill-anchored dropdown is unbuilt. The prototype's
  `planTokenValueCompletions` planner was removed as dead code in review, so this
  is a clean slice with nothing half-wired.)
- Saved-view round-trip for free text/search scopes.
- Strict-mode follow-ups (pending product decisions):
  - **Decision A — free-text semantics**: keep phrase (contiguous substring;
    free text already renders as one chip) vs. token-AND (match each word
    independently; needs a backend FTS change). See Query language above.
  - **Decision B — top-level grouping `( )`**: reserve it like the other
    operators, or leave it. Entangled with `tidyQueryText`/chip-removal (which
    strips redundant parens and would bail on a now-"invalid" paren) and
    removes documented top-level grouping — needs its own pass.
- **Layer system**: the bar's in-flow overlays use a hardcoded local ladder (X
  z-20 < autocomplete popover z-50, both drop into the table below the bar).
  These are genuinely local — they live inside the app's isolated `#__next`
  stacking context, can't escape it, and never need to beat a body-level
  overlay, so their z-index is fine. The **error tooltip is the exception**:
  when the popover is open it flips ABOVE the bar, into the page header's band,
  where no in-flow z-index can win — `#page > main` is `overflow:hidden` (clips
  anything above the bar) and the header is inside the isolated stacking
  context. So that one tooltip renders through the `"tooltip"` `<Layer>`
  (`components/ui/layer.tsx`), which puts it in a `<body>`-level overlay layer
  that paints above the whole app by DOM ORDER — no z-index needed.
- **The app-wide layer system** (`components/ui/layer.tsx`): `<Layer>` is now
  part of the full overlay band, not a one-off seed. `LAYER_ORDER` is
  `["agent", "modal", "popover", "tooltip", "toast"]` — five `<body>`-level
  layers (declared in `_document.tsx`), each its own isolated stacking context,
  stacked by DOM ORDER (later = on top), carrying NO z-index of their own. ALL
  overlays route through it: Radix/Vaul primitives via their `*.Portal`'s
  `container` (use `useLayerContainer` / `LayerPortal`), and bespoke
  imperatively-positioned content (like this bar's error tooltip) via `<Layer>`.
  No overlay carries a magic z-index to "escape to the top" anymore; the
  `@repo/no-overlay-zindex` lint rule enforces this — it bans high z-index on
  the `ui/*` overlay wrappers, and app-wide on any overlay _content_ element
  (e.g. a `*Content` you put a stray `z-50` on). When adding a search-bar
  overlay that must escape clipping/stacking, reach for `<Layer>` (bespoke) or a
  layer-routed Radix primitive — never a one-off portal + z-index.
- Optional: extract `SearchComposer`'s contenteditable selection/`beforeinput`
  machinery into a `useContentEditableController` hook to fully separate the
  imperative integration from the React component.
