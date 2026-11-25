# Multi-query dashboard charts

A widget starts with one chart. Add a tab to put another chart in the same dashboard slot. Each tab owns its series, formulas, filters, units, and chart type. The first tab opens by default. The dashboard only shows a tab bar when there are at least two tabs.

In the editor, click the widget title to rename it. Double-click a tab, press **F2** on a focused tab, or choose **Rename tab** from its menu. Select **+** and enter a name to create a tab. Duplicating a tab or moving series into a new tab also asks for the name. Press **Enter** to confirm or **Escape** to cancel, then **Save chart** to keep your edits.

Choose **Add formula** and type a series name to find its metrics. Pick with the mouse or with the arrow keys and **Enter**. After each operand the editor suggests arithmetic operators. Parentheses group an expression, and numbers can be typed directly. For example, divide the count of observations with a metadata key (A) by the count of all observations (B), then choose **Percentage** to display `A / B` as coverage. A series with multiple metrics gets aliases such as `A1` and `A2`. Incomplete formulas stay in the editor while the preview plots the other series.

`MultiQueryEditor` owns the tab drafts. `MultiQueryChart` selects the reader's active tab. Both use `useMultiQueryWidget` and the same result renderer. `SeriesLegend` toggles plotted series and reveals its full list on hover, focus or tap when the series do not fit. Search is available in crowded legends. The chart scales to the visible data and keeps the remaining series names first. The reader’s selection stays with its tab while the dashboard is open. It does not change saved settings or formula inputs.

`multiQueryModel` builds up to five ordinary analytics queries for the active tab. `useMultiQueryResults` gives each source a scheduler slot and reuses its cached results. A dashboard date or filter change applies to the active tab and to subsequent tabs when opened. Formula edits and legend toggles use the returned values in memory. Missing values and zero denominators produce gaps in the formula result.

Version 2 stores ordered tabs. The reader interprets saved version 1 configurations on open. Saving a change in the editor writes version 2. The dashboard document keeps its existing version and projection for classic clients.
