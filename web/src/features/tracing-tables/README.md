# Tracing Tables

Per-mount local state for the tracing table surfaces (observations, later
traces), following the local-store pattern from
`.agents/skills/frontend-large-feature-architecture`.

## Owner Map

- `observations/observationsTableStore.ts` — vanilla zustand store owning row
  selection, select-all, selected-page-row derivation, and the
  add-to-dataset dialog flag. Pure logic, covered by
  `observationsTableStore.clienttest.ts`.
- `observations/useObservationsTableView.ts` — creates the store per mount
  (lazy `useState`) and bridges the URL/session-storage `useSelectAll` state
  into it.
- `observations/ObservationsTableStoreProvider.tsx` — feature-scoped context
  for feature components (toolbar, dialogs). Shared components never consume
  this context: `DataTable` and `TableSelectionManager` receive the store
  explicitly via the `selectionStore` prop
  (`web/src/components/table/table-selection-store.ts`), so nested tables
  (e.g. ScoresTable inside the observation peek) are unaffected.

## State Boundaries

- Selection state: this store.
- Server/query state: tRPC in the table use-case component.
- Route/filter state: URL hooks in the table use-case component (frozen —
  see below).

## Status / Remaining Spread

`ObservationsTable` (`web/src/components/table/use-cases/observations.tsx`)
is still a controller component: inline column building, query-state assembly
from multiple hooks, and data preparation in render. Per the 2026-06 decision,
the legacy observations page is frozen (bugfix-only); the filtering/search
vertical is being rebuilt behind a flag rather than migrated further. The
selection store and the context-free `DataTable` selection API from this
folder are reused by the rebuilt surface.
