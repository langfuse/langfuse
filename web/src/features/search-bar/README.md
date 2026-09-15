# Search Bar

Grammar-based query editor for tables with a facet sidebar, including legacy
and embedded read paths. The sidebar's `FilterState` and the host's search
state remain canonical; both editors update the same state.

## Enablement

- Each sidebar host supplies a registry derived from its exposed facets. Settings
  lists and other tables without a sidebar retain their existing controls.
- `EventsTable` enables the bar when its controls are visible and filters are
  internally owned. Embedded tables exclude fields locked by their parent.
- `TableSearchBar` wraps the shared store, commit hook, and row for other hosts.
  Pass the host's existing search query and scope without changing their meaning.
  Tables without a backend text-search lane use a registry default field or
  disable free text. Organization catalogs omit `projectId`, which disables
  project recent searches and AI filtering.
- Key the wrapper by the saved-view `filterEditorResetKey` and sidebar
  `draftResetKey`. Applying a view or clearing filters resets unfinished drafts;
  deselecting a view after a user edit preserves them.
- There is no search-bar feature toggle. A registry enables AI only when its
  backend has a matching prompt and the organization enables AI features.

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
- `metadata.region:eu`, `scores.accuracy:>0.8` — `scores.` is level-agnostic
  (matches a score at observation OR trace level, LFE-10596). The legacy
  `traceScores.` namespace (trace-only) still parses/lowers so saved queries
  and URLs keep working, but it is no longer offered in suggestions.
- dot-path names with spaces/grammar chars are **quoted after the prefix**:
  `scores."Rouge Score":>=1`, `metadata."my key":eu` (the quotes are stripped
  to the real key when lowering; the reverse adapter and completions re-quote
  them — so they round-trip)
- `has:endTime` / `-has:endTime` null checks
- text search (see below): bare text, declared `content:`/`all:` scopes, and
  supported `input:`/`output:`/`name:`/`id:` fields

Cross-field OR, negated groups, and other shapes the flat contract cannot
represent are commit-blocking diagnostics, not silent drops. There is no
FTS `*` operator: the events tRPC filter contract has none.

**Full-text search.** Each registry declares `defaultSearchType` and
`searchScopes`. The adapter writes the existing `searchQuery` / `searchType`
contract; it does not introduce backend filter columns or change matching rules.

- **Bare text** (`refund policy`) is one phrase in the registry's default
  scope. Full Events uses `['id', 'content']`; metadata-first hosts use `['id']`.
- **`content:"refund policy"`** searches only the declared content lane.
  For Events this is input/output; for Prompts it is the prompt body; for
  Dataset Items it includes input, expected output, and metadata.
- **`all:"refund policy"`** uses `['id', 'content']`, including the host's
  IDs/names lane. This preserves the additive Full Text dropdown choice.
- **`input:` / `output:`** remain real string column filters on V4 Events,
  supporting comparisons such as exact/glob matches and negation. On legacy
  tracing and Dataset Items, registries instead declare them as search scopes
  backed by the existing `searchType` lane. Prompts does not support them.
- **`name:` / `id:`** remain ordinary column filters where the registry exposes
  them; they do not select the metadata search lane.

Scope tokens accept one positive phrase with the plain `:` operator. Multiple
scope phrases, a scope phrase mixed with bare text, negation, comparison/glob
operators, and grouped scope phrases are rejected: one backend search string
cannot express those independent predicates. Ordinary facet filters can still
combine with a scoped search, for example `content:"refund policy" env:prod`.
The same constraint is checked in validation and lowering. V4 Events column
filters remain independent, so `input:refund output:policy` continues to work.

The reverse adapter emits bare text only for the exact default scope, then
prefers a declared scope token. Unnamed legacy combinations use compatibility
syntax such as `in:(id OR input) "refund policy"`. This preserves every channel
without converting the search into a different column filter. `in:` accepts
only search types supported by that host, applies to the global bare phrase,
and is never offered in normal autocomplete. It cannot combine with a second
`in:` or another scope token.

Autocomplete offers only the registry's search scopes and supported V4 payload
column rewrites, with host-specific descriptions. SQL search remains one
`ILIKE %query%` phrase across an OR union of selected columns; V4's existing
fast IO search also applies its token prefilter. Search operators are not
silently translated between these backend search lanes and column filters.

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
- **Previews are an overlay, not a draft write.** `previewText` (store) is
  display-only state for "show the query this preset would apply" affordances
  (the events-table category-preset chips). `ComposerWithPreview` stacks a
  read-only preview surface over the (mounted, hidden) editor while it is
  active — SearchComposer itself knows nothing about previews and its DOM is
  never reprojected by one. The preview never merges into the draft, never
  commits, and any real draft write clears it — so ending a preview can never
  lose in-progress typing, by construction rather than by restore logic.
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
- **User-authored filters are never auto-removed.** The bar reads a display
  projection of the sidebar's **explicit** `FilterState`, so the
  managed-environment implicit default (`environment none of [hidden internal
envs]`, derived into _effective_ state by
  `features/filters/lib/managedEnvironmentPolicy.ts`) never shows as a token.
  That policy strips the implicit `none of [hidden]` default (which the facet
  also re-creates on "clear back to default") and keeps
  `none of [hidden ∪ extras]` in persisted/effective state so queries still
  exclude the hidden set. The search-bar projection shows only extras
  (`-environment:production`). A bar commit of that extras-only chip expands
  back to the full exclusion set. Enabling any hidden environment stores a
  positive `any of [checked]` instead, so it cannot be remasked as extras-only
  none-of. A user-authored positive selection (`environment:default`, typed or
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
  `observed-options.ts` (filterOptions → per-column observed values, plus
  `withMetadataPathOptions` — see "Metadata key suggestions"),
  `searchBarInvariants.ts` (pure, registry-shaped
  property-test harness — the universal safety net reused per view; see
  Hardening).
- `store/searchBarStore.ts` — per-mount vanilla zustand store, **draft only**
  (`setDraft`/`resetTo`/`removeChipSpan`/`revealInvalid`). No committed copy,
  no commit workflow. Provided with the container's `commit` via
  `store/SearchBarStoreProvider.tsx` (`useSearchBarStore` selector,
  `useSearchBarCommit`).
- The observed-metadata suggestions cache is **shared with the filter sidebar**,
  so it lives outside this feature: `src/stores/observedMetadataStore.ts`
  (global zustand store persisted to localStorage, per-project map of observed
  metadata keys → types), `src/fns/observedMetadata/metadataPaths.ts` (the pure
  analysis + option projection) and `src/hooks/useObservedMetadata.ts` (the
  harvest/read bridge). See "Metadata key suggestions" below.
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

## Host-provided query presets

Views can inject complete-query sections through `EventsSearchBarRow`'s
`presetSections` prop. These are data, not grammar: the shared planner renders
them at every blank top-level term, including after existing filters, and a pick
replaces and commits the complete draft. The host owns fetching, ranking,
registry compatibility, labels, and optional pick analytics.

Evaluation setup uses this seam for **Reuse rule filters**. It groups equivalent
modern event/experiment rule filters, ranks them only by distinct attached
evaluator count (latest rule update breaks ties), and excludes legacy
trace/dataset rules. Rule `FilterState` is serialized with the rule registry and
validated against the receiving registry before it is offered, so aliases such
as rule `tags` can safely lower to the events table's `traceTags` column.

## AI filter mode (the "Ask AI" button)

The bar is also the home of AI-assisted filtering on v4 (it replaces the legacy
sidebar "✨ wand" — `EventsTable` now passes `filterWithAI={!searchBarMode}`, so
the wand only survives on Cloud, on non-bar/embedded surfaces and the leftover
traces table). Self-hosted uses Ask AI on this bar only.

- **Entry.** The **"Ask AI"** affordance opens AI mode — a plain button placed
  AFTER the field in DOM order, always available (build from scratch OR refine
  existing filters). Tab is deliberately NOT a shortcut: while typing it belongs
  to autocomplete navigation, so forward-tab just moves focus from the field
  onto the button. `EventsSearchBarRow` owns the `'grammar' | 'ai'` mode and
  gates availability on `organization.aiFeaturesEnabled` (the server enforces it
  too). `SearchComposer` only takes an `onActivateAi` callback
  - renders the affordance; it stays grammar-only.
- **The component.** `components/SearchBarAiPrompt.tsx` — a plain NL input (not
  the contenteditable). Enter generates; Esc or the back arrow exits (no
  blur-to-exit — leaving is explicit so a stray click never loses your prompt).
- **The endpoint.** `server/router.ts` (`searchBar.generateFilter`), NOT the
  legacy `naturalLanguageFilters.createCompletion`. Its prompt is built from
  the selected view's `FieldRegistry` (`server/buildFilterPrompt.ts`), so the
  model's vocabulary IS that view's grammar. The events registry compiles the
  managed `search-bar-filter` prompt with its catalog; other registries use
  their registry-derived local prompt until they have a managed prompt of their
  own. Observed-value grounding is selected from the same registry, so it cannot
  advertise columns the view rejects. The endpoint asks for a flat `FilterState`
  (an array of `singleFilter`), then **round-trips it through
  `filterStateToQueryText` server-side and returns only the filters that lower
  to bar pills** — a hallucinated/unsupported column lands in `skippedFilters` and is
  dropped before it reaches the client. A unit test
  (`__tests__/server/unit/searchBarFilterPrompt.servertest.ts`) asserts every
  field's prompt-recommended `type` round-trips, so the prompt can't drift from
  the reverse adapter.
- **Apply-immediately.** The result is applied via `useEventsSearchBar`'s
  `applyFilters` (it preserves grammar-less `skippedFilters` like a commit, then
  writes `setFilterState`), so on returning to grammar mode `resetTo` re-derives
  the generated filters as editable pills. There is no separate AI→bar sync path.
- **Refine clears the free-text lane.** When opened with filters present, the
  bar's full committed text (free text rendered inline) is the refine context
  sent to the model, which returns the COMPLETE updated `FilterState`. So
  `applyFilters` also clears `searchQuery` and resets `searchType` to
  `DEFAULT_SEARCH_TYPE` — anything the model didn't re-emit is dropped, including
  free text the user asked to remove. Without this, a stale `searchQuery` would
  survive and `resetTo` would re-derive the dropped text back into the bar.

## Metadata key suggestions (client-side observed map)

The API does not enumerate metadata keys, and backend metadata-structure
analysis is deferred (until CH26), so `metadata.` completions are fed
**client-side from rows the user has already loaded**:

- On each fetch, `src/hooks/useObservedMetadata.ts` samples the visible rows'
  metadata (same first-30 sampling as the AI-context path), records their
  **top-level keys** with the observed JSON value type
  (`src/fns/observedMetadata/metadataPaths.ts`), and unions the result into
  `src/stores/observedMetadataStore.ts` — persisted to localStorage, **per
  project** (one global `Record<projectId, …>` map, the globalDateRangeStore
  shape).
- `EventsTable` merges the project's map into the observed options where the
  completion planner already looked (`withMetadataPathOptions`): keys under
  `metadata` (`keyPathOptions`) and each key's observed values under
  `metadata.<key>` (the value stage). So typing `metadata.` suggests observed
  keys with the type as the option detail (`metadata.hej` · `number`), and
  `metadata.region:` offers the first few observed values (`eu`, `us`, …).
- **Values are first-observed distinct scalars, skip-don't-truncate.** Only
  string/number/boolean leaves are collected (object/array stored forms could
  not round-trip into a matching `=` filter), and a value longer than the cap
  is dropped entirely — a truncated suggestion would insert a filter that
  confidently matches nothing.
- **Top-level keys only, never flattened dot-paths.** Metadata is stored as a
  flat `Map(String, String)`: nested object values are JSON-encoded strings
  under their top-level key, and `StringObjectFilter` matches the LITERAL
  top-level key — a flattened `metadata.scope.name` suggestion would lower to
  key `scope.name` and match nothing (the metadata view's filter shortcut
  resolves the top-level key for the same reason). Dotted suggestions still
  appear whenever producers use dotted top-level keys (the OTel-attribute
  shape, `gen_ai.request.model`); object-valued keys are suggested with type
  `object` and their nested content matches via contains
  (`metadata.scope:*value*`).
- **Types are display-only.** Metadata filters always lower to `stringObject`
  (numeric metadata comparisons are rejected by `operatorIssue`); a key
  observed with more than one type — or only ever `null` — drops its hint
  instead of showing a wrong one (`mixed` is absorbing).
- **Bounded on every axis**: 30 sampled rows per fetch, key length ≤ 100
  chars, ≤ 200 keys per project (first-observed wins), ≤ 5 values per key,
  value length ≤ 60 chars, ≤ 1024 values per project, ≤ 20 projects
  (least-recently-updated evicted), plus a persist `version` key that resets
  the cache on schema change. A no-change merge skips the localStorage write.
- Accepted caveat: metadata the user has never loaded is never suggested (if
  they haven't seen it, they don't know it exists either).

## Extending to other views (the universality contract)

The bar is intended to become the primary filter interface for **every**
filterable view, not just the v4 events table. That is cheap _by design_ — but
only if new views extend it through the seam below instead of forking the
grammar. Read this before adding another view.

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

**The multi-view seam is implemented.** Parser, validator, adapter, reverse
adapter, serializer, completion planner, token projection, store, and AI prompt
all take an injected `FieldRegistry`. `EVENTS_FIELD_REGISTRY` remains the default
for existing call sites; evaluation rules pass `RULE_FIELD_REGISTRY`, which is
derived from the same `eventsEvalFilterColumns` used by backend validation, and
the v4 sessions table passes `SESSIONS_FIELD_REGISTRY`
(`features/filters/config/sessionsSearchRegistry.ts`).

**Use `TableSearchBar` for table hosts.** It passes one registry to the hook and
row. A specialized host that uses `useEventsSearchBar` and `EventsSearchBarRow`
directly must pass the same registry to both, so autocomplete and commits agree.

Registries with a backend search lane also declare `defaultSearchType` and
`searchScopes: Record<string, { searchType, label, description }>`. Scope
entries describe existing backend search types, not `FilterState` columns;
unsupported host lanes must not be declared. Preserve both declarations when
projecting or extending a registry. Hosts pass their actual query and scope
setters so a commit can change the scope and the phrase together. Views with
`allowFreeText: false` keep their existing `defaultTextField` behavior.

**Recipe to add the bar to a view:**

1. **Derive the field registry from the view's FACETS, not its raw columns.** Use
   `fieldRegistryFromColumns(cols, overlay)` — never hand-author a second
   47-entry list; ~70% is mechanical (`type → kind`, `nullable`,
   `options → observed values`, `unit`). But feed it the columns the _facet
   sidebar_ exposes, as `sessionsSearchRegistry.ts` does, not the whole
   `ColumnDefinition[]`. A view's column list also carries internals the sidebar
   deliberately never offers — a duplicate (`usage` = `totalTokens`), a column
   owned by another control (`createdAt`, the time-range picker), a retired one
   (`bookmarked`). Deriving from facets keeps the bar a strict SUBSET of the
   sidebar by construction: no bar-authored filter the sidebar cannot display or
   clear, and adding a facet gives the bar the field for free. Anything outside
   that set resolves to null, so an old saved view's filter on it lands in
   `skippedFilters` (preserved) instead of becoming an unparsable token.
2. **Add a thin per-view grammar overlay** for what `ColumnDefinition`
   deliberately does not carry (it is a UI/SQL contract, not a grammar):
   user-facing **field aliases** (`env`, `tags`, `ttft`), **inline filter
   aliases/macros**, **AI context fields**, **dot-path roots**
   (`metadata.`, `scores.`/`traceScores.` and their score columns), and
   **value-parse hints** (datetime ISO, numeric, boolean). Keep it small and
   declarative.
   A field's `syncMode` can override the column-derived default: Scores uses
   `textSearch` plus `suggestObservedValues` for option-backed score names, so
   bare text searches within names while selected exact values still round-trip.
   The derived `exactMatchUsesOptions` flag keeps singleton exact selections in
   a categorical facet's `stringOptions` shape, so its checkbox stays selected.
   Three flags are per-view capabilities, not cosmetics:
   - `metadata` / `scores` / `traceScores` — the keyed dot-path roots. Set them
     from the columns the view's BACKEND has, not from what reads well: sessions
     aggregates scores at session level and has no `trace_scores_*` columns, so
     it keeps `scores.` and closes `traceScores.`. A dot path the backend cannot
     answer is worse than an unknown-field diagnostic. `fieldRegistryFromColumns`
     drops the keyed score columns from the field list when `scores` is on
     (`score_categories` is `categoryOptions`, not `*Object`, so the `*Object`
     filter alone would leave a bogus keyless `score_categories:` field).
   - `allowFreeText` + `defaultTextField` — see "Bare text on a view with no
     full-text lane" below.
   - `searchExamples` — the placeholder, **written per view, never derived from
     field ids**. The events examples (`level:ERROR`, `latency:>2`) advertised
     fields that do not exist on either of the other two surfaces.
3. **Reuse the view's `filterOptions` tRPC** for observed values —
   `observed-options.ts` already maps that payload to per-column observed
   values; point it at the new view's procedure (do not invent a parallel one).
   When a field displays labels but persists stable values, declare its
   canonical `filterColumn` in the registry overlay and hydrate it with
   `withFieldOptions([{ value, displayValue }])`. The shared adapter then emits
   the canonical column/value while the reverse adapter renders the label.
   Do not add a host-specific post-lowering conversion.
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

**Bare text on a view with no full-text lane.** Sessions has no `searchQuery`
at all — `sessions.all*` takes none. Two registry options cover that:

- `allowFreeText: false` alone — bare words are a commit-blocking diagnostic
  (evaluation rules).
- `allowFreeText: false` + `defaultTextField: "<field>"` — bare words become a
  `contains` filter on that field (sessions uses `id`: it is that view's
  most-applied filter by an order of magnitude, and every application of it is
  `contains`). Two properties make this safe rather than magic: the rewrite is
  **offered before Enter** (it joins the matching-filter suggestions, so the user
  sees `id:"…"` while typing), and it is **visible and terminal after** — the bar
  re-renders the word as an `id:` pill which commits to the identical filter. It
  lowers through the normal field path; there is no second lowering path.
- A multi-word run is ONE phrase, coalesced exactly like `searchQuery` is. Per
  word it would AND `id contains test` with `id contains 123` — matching neither
  the input nor the suggestion.

**`createFieldRegistry` stays unexported.** Both derived views (rules, sessions)
are fully expressed by `fieldRegistryFromColumns` + overlay; nothing has yet
needed to hand-assemble a registry. Do not export it speculatively.

**What stays grammar-global — do not make per-view:** tokenizing, quoting
(`serializeValue` ↔ `reservedTokenIssue` is a **mirror invariant**: add a
reserved token to one, add it to the other, or the round-trip test fails),
operator precedence, and the `has:` pseudo-field. These are language, not
data — a new view inherits them unchanged.

**Do not add speculative registries.** Build each derivation + overlay with a
real consumer and validate it against that view's backend filter contract.

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
  passed `view.registry`, so it auto-covers added/changed fields. Each
  filterable view gets the same coverage by adding one block to the
  `.clienttest.ts` with its registry — see "Extending to other views". It only
  exercises free text through `freeTextValues` (INV-3, serialize↔parse), so a
  `defaultTextField` view must also pin its phrase/round-trip behaviour
  explicitly, as the sessions block does.

- **`SearchComposer` (~1.3k LOC) has no unit tests** — the contenteditable
  controller is browser-reviewed only. Extracting the selection/`beforeinput`
  machinery into a hook (below) is the prerequisite to testing it.
- **Client integration coverage** in `web/src/components/table/data-table-controls.clienttest.tsx`
  exercises real sidebar inputs, filter state, and bar commits: delayed string
  and numeric edits preserve newly committed bar filters, and clearing a facet
  cancels its pending edit. This does not cover the table's network request or
  rendered result rows.
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
- Optional: extract `SearchComposer`'s contenteditable selection/`beforeinput`
  machinery into a `useContentEditableController` hook to fully separate the
  imperative integration from the React component.
