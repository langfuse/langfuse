# Experiment I/O presentation

`ExperimentResultsPage` owns the local display preference through
`useExperimentIoRenderMode`. The existing `experiment-itemsIoRenderMode` key
preserves JSON (`json`) and Compact (`text`) preferences and also accepts
Formatted (`formatted`). Changing this preference does not change comparison
URL parameters.

`ExperimentIOCell` selects the renderer for input, expected output, and each
run's output in both list and comparison-grid layouts. Formatted delegates to
the trace detail view's `IOPreviewPretty` through `FormattedIOTableCell`.
JSON and Compact retain the existing table renderer. The shared pretty parser
handles conversations, tool calls, Markdown, and structured-data fallbacks.

The data hook requests bounded complete I/O only for Formatted. `batchIO`
validates the selected page and runs, applies the per-field size cap, and bounds
the combined response with the helpers in `server/experimentIo.ts`. The query
cache includes this choice. Truncation flags travel with each value: a preview
head is displayed with an explicit notice instead of being parsed as complete
JSON. Expected-output verdicts exclude truncated values.

The host table owns row heights and navigation. The formatted cell owns its
scrollport and stops internal expansion/control clicks from selecting the row;
ordinary conversation text retains the host's detail-navigation behavior.

Renderer interaction coverage lives in `FormattedIOTableCell.stories.tsx`.
The state hook and server input/budget contracts have focused unit tests.
