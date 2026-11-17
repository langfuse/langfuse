# Dashboard editor

The editor updates the ordinary dashboard definition. Query and Markdown placements also render on the regular dashboard.

- `DashboardStudioPage` owns route/data loading, access checks, save workflow, time range, and the per-mount document store.
- `studioStore` owns reversible document actions. Server data seeds it once after loading; query refreshes do not overwrite edits.
- `StudioDashboardFilters` reuses shared dashboard facets and environment discovery. `saveStudioDashboard` persists the document and shared filters with separate saved baselines, so a partial failure remains retryable.
- `StudioWidgetEditor` owns the widget draft and last-run configuration. Run preview validates and runs data changes; Apply changes requires a current, complete preview and writes the widget to the dashboard draft. Complete zero-row results remain valid. Save dashboard persists the document.
- Widget editing replaces the dashboard canvas with a full-width workspace. The preview and query workspace share a resizable vertical split, with appearance settings in a separate column. Each area scrolls independently. The dashboard canvas is unmounted while editing so its queries do not compete with the preview.
- `StudioQueryWorkspace`, `StudioSeriesEditor`, `StudioFilterEditor`, and `StudioFormulaEditor` own the query controls. `StudioWidgetAppearance` owns presentation controls.
- Formula fields and server execution share the bounded arithmetic parser in `dashboard/lib/studioExpressions`. The server remains authoritative for units, alignment and query semantics.
- `useStudioWidgetResult` owns scheduled execution and shares the bounded query cache between dashboard and editor. `studioQueryConfig` projects the data-affecting request and detects pending changes. Titles, labels, units, legend visibility, displayed series, and compatible chart types reuse results.
- `StudioQueryWidget` renders the ordinary dashboard card; `StudioWidgetPreview` renders the editor result without nested card chrome. Both use the fetch-free result presentation and `prepareStudioChart`, which adapts backend results without inventing totals or missing values.
- Series colors are assigned to the full, deterministically ordered result before applying display selection. Small desktop time-series legends opt into wrapping; mobile and larger legends retain overflow.
- `StudioPresetGallery` provides editable templates and access to existing legacy widgets. `StudioMigrationPanel` compares a legacy widget with its replacement before changing the dashboard draft.
- `StudioPlacementCard` provides chart/text placement chrome and actions. Markdown uses the existing protected renderer.
- `clipboard` validates versioned placement payloads. `analytics` accepts structural metadata only.

Configuration contains independent named queries, measures, breakdowns, filters, and formulas. Overlapping populations remain independent. Full-period summaries come from the backend; bucket averages and percentiles are never summed to produce a headline.
