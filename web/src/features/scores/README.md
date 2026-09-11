# Scores

Score rendering, annotation forms, mutations, and the project Scores search bar.

- `components/ScoresSearchBar.tsx` owns the shared composer's lifecycle. It
  edits the table's existing sidebar filter state; the only local state is the
  shared editor's draft. It uses the table's filter-option response.
- `constants/scoresSearchRegistry.ts` derives the grammar from the Scores
  sidebar's facets, excluding parent-owned fields in scoped tables. Bare text
  searches within score names; exact selections,
  numeric ranges, boolean values, and categorical values retain their existing
  filter shapes. There is no independent full-text search or aggregate-score
  namespace.
- `components/table/use-cases/scores.tsx` (under `src/`) owns data fetching,
  URL/saved-view filters, and the table. Sidebar tables share the bar and pass
  their filter configuration so the grammar matches their available facets.

The shared grammar and extension contract live in `features/search-bar/README.md`.
