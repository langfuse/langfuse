# Multi-query dashboard charts

A widget starts with one chart. Add a tab to put another chart in the same dashboard slot. Each tab owns its series, formulas, filters, units, and chart type. The first tab opens by default. The dashboard only shows a tab bar when there are at least two tabs.

`MultiQueryEditor` owns the tab drafts. `MultiQueryChart` selects the reader's active tab. Both use `useMultiQueryWidget` and the same result renderer. `SeriesLegend` toggles plotted series and reveals its full list on hover, focus or tap when the series do not fit. Search is available in crowded legends. The chart scales to the visible data and keeps the remaining series names first. The reader’s selection stays with its tab while the dashboard is open. It does not change saved settings or formula inputs.

`multiQueryModel` builds up to five ordinary analytics queries for the active tab. `useMultiQueryResults` gives each source a scheduler slot and reuses its cached results. A dashboard date or filter change applies to the active tab and to subsequent tabs when opened. Formula edits and legend toggles use the returned values in memory. Missing values and zero denominators produce gaps in the formula result.

Version 2 stores ordered tabs. The reader interprets saved version 1 configurations on open. Saving a change in the editor writes version 2. The dashboard document keeps its existing version and projection for classic clients.
