# Table Column Creators

Column creators define reusable visual column types for Langfuse tables. They keep the loaded cell renderer and its loading skeleton colocated so these states cannot drift apart.

## Accessors

Use `accessorKey` when the displayed value exists directly on the row:

```tsx
createTextTableColumn<Row>({
  accessorKey: "name",
  header: "Name",
});
```

Use `accessorFn` for a derived value. Computed columns require an explicit, stable ID for sorting, visibility, and persisted column order:

```tsx
createNumberTableColumn<Row>({
  id: "tokensPerSecond",
  accessorFn: (row) => {
    if (!row.latency || !row.outputTokens) return null;
    return row.outputTokens / row.latency;
  },
  header: "Tokens per second",
  formatter: (value) => numberFormatter(value, 0, 1),
});
```

## Adding A Creator

Build new creators with `utils/createTableColumn`. The helper provides the shared accessor contract, derives column identity, connects TanStack's typed `getValue()`, and assigns the creator-owned loading cell.

Keep creator-specific presentation options in the specialized creator rather than adding them to the shared helper. A creator should represent a stable, reusable visual and loading-state pair, not feature-specific data fetching or business logic.

```tsx
export function createExampleTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, string>,
) {
  return createTableColumn<TData, string>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value) => (value ? <Example value={value} /> : null),
  });
}
```

## Rules

- Callers must not be able to override override `cell` or `loadingCell`.
- `accessorKey` is constrained to row fields supported by the creator.
- An `accessorKey` automatically becomes the column ID.
- Computed values use `accessorFn` with a required `id`.
- `accessorKey` and `accessorFn` are mutually exclusive.
- Remaining `LangfuseColumnDef` options, such as `header`, `size`, sorting, and hiding, pass through unchanged.
