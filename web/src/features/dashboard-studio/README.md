# Dashboard editor

The editor updates the ordinary dashboard definition. Query and Markdown placements also render on the regular dashboard.

- `DashboardStudioPage` owns route/data loading, access checks, save workflow, time range, and the per-mount document store.
- `studioStore` owns reversible document actions. Server data seeds it once after loading; query refreshes do not overwrite edits.
- `StudioDashboardFilters` reuses shared dashboard facets and environment discovery. `saveStudioDashboard` persists the document and shared filters with separate saved baselines, so a partial failure remains retryable.
- `StudioWidgetEditor` validates the draft as it changes. It debounces changes to query inputs and automatically loads the next preview. Apply changes writes the widget to the dashboard draft once the current preview is complete, including a complete result with zero rows. Save dashboard persists the document.
- The widget editor places the series list beside the chart preview. On narrow screens, Series and Preview switch between the same mounted panels. Chart settings opens from the preview toolbar. Editor options opens the classic editor or enables experimental queries on the same draft.
- `StudioQueryWorkspace`, `StudioSeriesEditor`, `StudioFilterEditor`, and `StudioFormulaEditor` own the query controls. `StudioWidgetAppearance` owns presentation controls.
- The formula editor translates letters such as A and B to stable saved metric references. Current-mode arithmetic reuses operands returned by the existing dashboard API. The calculation shows the inputs and output for one matching time bucket and breakdown, initially choosing the latest measured result. Readers can inspect empty buckets too.
- `useStudioWidgetResult` owns scheduled execution and shares the bounded query cache between dashboard and editor. `studioQueryConfig` projects the data-affecting request and detects pending changes. Titles, labels, units, legend visibility, displayed series, and compatible chart types reuse results.
- `StudioQueryWidget` and `StudioWidgetPreview` render one active chart. A saved v2 widget owns ordered tabs, each containing its own queries, formulas and display settings. One tab needs no tab strip. Readers can toggle individual legend items without changing the saved chart.
- Series colors are assigned to the full, deterministically ordered result before applying display selection. Small desktop time-series legends opt into wrapping; mobile and larger legends retain overflow.
- `StudioPresetGallery` provides editable templates and access to existing legacy widgets. `StudioMigrationPanel` compares a legacy widget with its replacement before changing the dashboard draft.
- `StudioPlacementCard` provides chart/text placement chrome and actions. Markdown uses the existing protected renderer.
- `clipboard` validates versioned placement payloads. `analytics` accepts structural metadata only.

Configuration contains independent named queries, measures, breakdowns, filters, and formulas. Overlapping populations remain independent. Full-period summaries come from the backend; bucket averages and percentiles are never summed to produce a headline.
