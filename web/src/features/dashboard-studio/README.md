# Dashboard studio

The studio edits the ordinary dashboard definition. Query and Markdown placements also render on the regular dashboard.

- `DashboardStudioPage` owns route/data loading, access checks, save workflow, time range, and the per-mount document store.
- `studioStore` owns reversible document actions. Server data seeds it once after loading; query refreshes do not overwrite edits.
- `StudioDashboardFilters` reuses shared dashboard facets and environment discovery. `saveStudioDashboard` persists the document and shared filters with separate saved baselines, so a partial failure remains retryable.
- `StudioWidgetEditor`, `StudioSeriesEditor`, and `StudioFilterEditor` own explicit draft edits. Run preview validates and runs the draft; Apply widget writes it to the document. Save dashboard persists the document.
- Widget editing replaces the dashboard canvas with a full-width workspace. Its action bar stays visible while the preview and configuration scroll. Queries contains compact source, metric, filter and breakdown controls; Visualization and Details hold presentation settings. The dashboard canvas is unmounted while editing so its queries do not compete with the preview.
- `StudioQueryWidget` reads the protected studio query endpoint and uses the existing chart preparer and design-system renderer. `prepareStudioChart` adapts backend results without inventing totals or missing values.
- `StudioPlacementCard` provides chart/text placement chrome and actions. Markdown uses the existing protected renderer.
- `clipboard` validates versioned placement payloads. `analytics` accepts structural metadata only.

Configuration contains independent named queries, measures, breakdowns, filters, and formulas. Overlapping populations remain independent. Full-period summaries come from the backend; bucket averages and percentiles are never summed to produce a headline.
