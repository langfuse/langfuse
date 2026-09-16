# Topics UI

- `TopicsPage.tsx` owns facet configuration, execution
  selection, topic filters, summary lists, and transcript inspection. Results appear
  first at full width, then pipeline controls and past executions. Without an
  execution URL parameter, the newest execution with published results is selected.
  A single run-status label sits alongside the heading; stage, operation and cost
  estimates live in Run details. Facet outcomes use result-oriented labels and
  omit zero-valued exception counts. Facet processing settings, including
  embedding dimensions, are versioned together.
- `TopicPipelineForm.tsx` owns operation, facet versions, budgets and submission.
  Every available facet starts selected. Reclustering offers only completed
  batches containing every selected facet version, excluding incompatible choices.
- `TopicTraceSelector.tsx` reuses the eval filter builder and query editor, with
  a time range and random/latest sampling. Explicit preview fixes the cohort;
  changing criteria invalidates it. Rows can be excluded across preview pages.
  The form submits only those reviewed trace IDs. Paste IDs remains available.
  `server/traceSelection.ts` applies canonical observation filters within a
  maximum 93-day window, then deduplicates traces before counting and sampling
  up to 1,000. All predicates match the same observation; the worker reads the
  whole containing trace, including observations outside the selection window.
  Preview only reads identifiers and display metadata and never calls a model.
  The reviewed identities are fixed; source trace content can still change before
  the worker loads it. Preview responses are not a historical trace snapshot.
- `TraceTranscriptDialog.tsx` provides **Show transcript** on the standalone trace page
  and both trace/observation peek headers, including their overflow menus. It fetches
  only while open, using the same deterministic, facet-independent transcript
  loader as the worker. The JSON viewer displays the ordered JSONL records as an
  expandable array, preserving strings inside each record. Saved summaries load
  separately from ClickHouse: latest
  result per facet version, with historical-input provenance. Viewing them never
  triggers inference, even when the original trace is unavailable.
  It regenerates current data, not a historical copy. The read endpoint retains
  the local-development and project-access gates. Content is marked `ph-no-capture`;
  this local diagnostic control intentionally adds no product analytics event.
- `TopicEmbeddingMap.tsx` loads the published map and renders its saved 2D UMAP
  coordinates. Point hover/selection is local to the map; topic selection is
  shared with the cards and list and fits the plot to that topic's points, making
  overlapping groups easier to inspect. Arrow keys navigate a single roving tab
  stop; Enter or Space keeps a point selected. The plot uses the measured viewport
  and rotates the cohort's principal axis horizontally, then applies one uniform
  scale to preserve all relative 2D distances. Topic zoom retains the cohort's
  orientation. The shared element-size hook owns the ResizeObserver lifecycle;
  geometry is derived during render. Saved coordinates and clustering are unchanged.
  Missing-coordinate warnings remain visible below the map.
- `server/topicsRouter.ts` owns project authorization and the public result
  contract. The map joins coordinates to the immutable discovery manifest by
  index, then looks up summaries and assignments by ID. It never exports vectors.
  History and detail reads reconcile interrupted/queued retries with the queue.
  Resume only enqueues work: the worker exclusively advances existing execution
  journals, including finalization after all facet results have been saved.
  Partial facet configuration changes retain settings omitted by the caller.
- `parse-trace-input.ts` validates pasted trace IDs and links without fetching.
  Trace IDs are opaque data; URL path segments are decoded once, while internal
  execution/artifact IDs retain the strict filesystem-safe format.

The plot is an approximate 2D view, separate from clustering and classification.
It always shows the original discovery cohort. Later assignment batches keep
their results in the list; they are explicitly reported as unpositioned because
the PoC does not retain a UMAP transform. Missing artifacts show an explanation
instead of fabricated coordinates. Missing source summaries do not shift the
remaining points' indices.

Runtime, numerical pipeline, and local budgets:
[`worker/src/features/topics/README.md`](../../../../worker/src/features/topics/README.md).
