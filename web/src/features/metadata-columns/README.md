# Metadata columns

The main v4 Traces and Observations routes opt into browser-local metadata
columns through `EventsTable.enableMetadataColumns`. Embedded tables and the
legacy v3 table do not opt in.

- `MetadataColumnsSettings` edits keys and display labels, and opens the existing
  metadata filter editor. Removing a column preserves its filters.
- `createMetadataColumns` and `MetadataTableCell` display the current row's
  metadata, with loading separate from JSON values. `EventsTable` parses each
  row's existing batch I/O metadata once. No extra requests are made.
- `metadata-columns.ts` owns stable column IDs, local-layout projection, and
  saved-view exclusion. Keys are literal top-level keys, including dots.
- `useMetadataColumns` subscribes to browser storage, scoped to project and the
  canonical `observations-events` table. Both main v4 routes share these
  preferences. Storage failure retains a preference in memory for the page
  lifetime.

Dynamic column definitions, visibility, and positions stay separate from the
ordinary column-order and visibility stores. Applying a saved view changes
ordinary columns while retaining the metadata columns' local slots. Creating
or updating a saved view excludes dynamic IDs, including the stored-layout
fallback for a view that has not been applied. Metadata filters remain normal
saved-view filters. Editing only a metadata column does not deselect a view.

Values use the existing I/O preview and its truncation limits. Missing and null
values are blank; zero and false are preserved. Arrays and objects are displayed
as JSON. Metadata filtering retains the existing string-object semantics; an
array is matched as serialized text, not by exact array membership. Display
labels do not affect filtering, and columns do not offer server-side sorting.

Customer keys and labels are blocked from session replay in cells, headers,
settings, and the column picker. The existing column-visibility event uses the
static analytics ID `metadata`; this feature adds no analytics events or error
reports for expected local-storage and malformed-payload states.
