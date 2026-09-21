# Topics UI

Topics requires explicit opt-in through **Profile → Feature Previews → Langfuse
Topics**. Only platform administrators see or change this personal flag. The
sidebar, direct page, transcript controls, and Topics API require the flag;
existing local-development and project-access checks still apply.

- `TopicsPage.tsx` owns facet configuration, execution
  selection, historical topic filters, summary lists, and transcript inspection.
  The main workspace shows results and topic cards. Configure topics and History
  open a centered configuration dialog and a history drawer from the toolbar;
  Process traces or Update topics submits the retained configuration. Overlay owners stay outside the
  responsive header menu, which closes before configuration or history opens.
  Without an execution URL parameter, `CurrentTopics.tsx` displays current per-trace
  assignments across runs and facets; explicit execution links remain historical.
  A single run-status label sits alongside the heading; stage and operation
  live in Run details. Facet outcomes use result-oriented labels and
  omit zero-valued exception counts. Facet versions contain only prompts;
  processing settings and embedding dimensions are frozen on executions.
- `TopicPipelineForm.tsx` owns the configuration dialog, operation, facet versions
  and submission. Its state stays mounted when the dialog closes; the action
  remains outside the dialog and uses the reviewed selection. The render prop
  separates header actions from the mounted dialog. Preview trace clicks close
  configuration before opening the trace peek in the panel layer.
  Every available facet starts selected. Process traces is the default operation:
  it summarizes, embeds, and assigns only the selected batch to current topics.
  Without a compatible map, summaries wait for an explicit Update topics run.
  Update topics reads compatible stored summaries directly; each selected facet
  shows its available summary count. It has clustering settings but no trace
  picker, source-execution selector, or target-map selector. Embedding dimensions
  are configured per execution; updates select matching stored embeddings and
  never regenerate them. History and progress responses omit trace IDs, summary
  IDs, and per-trace errors, using aggregate counts for progress.
  Expanding Trace errors loads failed trace IDs and reasons on demand.
  Saved topic rules hold reusable filters, sampling and stable facet IDs, like
  evaluator rules. Selecting a rule loads its criteria and each facet's latest
  prompt version; editing criteria or facets becomes an ad hoc run until explicitly
  saved. Rules do not create separate maps or invalidate summaries and embeddings.
  These local PoC operations and rule saving add no product analytics event.
- `TopicTraceSelector.tsx` reuses the eval filter builder and query editor, with
  a time range, all matching traces selected by default, and optional random/latest
  sampling with a user-chosen size. Rule criteria initialize a keyed selector;
  dates stay specific to each execution. The render prop supplies selection,
  criteria and controls so the dialog can unmount without losing the reviewed
  cohort. Explicit preview counts the cohort;
  changing criteria invalidates it. Rows can be excluded across preview pages.
  The form submits reviewed criteria and exclusions. Paste IDs remains available.
  `server/traceSelection.ts` applies canonical observation filters within a
  maximum 93-day window, then deduplicates traces before counting and optional
  sampling. There is no total trace cap. Preview rows and current results render
  in pages of 20; selected IDs are frozen by the server at submission. All predicates match
  the same observation; the worker reads the
  whole containing trace, including observations outside the selection window.
  Preview only reads identifiers and display metadata and never calls a model.
  Matching counts can change between preview and submission, and source trace
  content can change before the worker loads it. Preview responses are not a
  historical trace snapshot.
- `TraceTranscriptDialog.tsx` provides **Show transcript** on the standalone trace page
  and both trace/observation peek headers, including their overflow menus. It fetches
  only while open, using the same deterministic, facet-independent transcript
  loader as the worker. The JSON viewer displays the compact transcript as an
  expandable array, preserving strings inside each record. Saved summaries load
  separately from ClickHouse: latest
  result per facet version, with historical-input provenance. Viewing them never
  triggers inference, even when the original trace is unavailable.
  It regenerates current data, not a historical copy. The read endpoint retains
  the local-development and project-access gates. Content is marked `ph-no-capture`;
  this local diagnostic control intentionally adds no product analytics event.
- `TopicEmbeddingMap.tsx` loads the published map and renders its saved 2D UMAP
  coordinates. Clicking a point pins its summary until another selection; only
  split view synchronizes selection and pagination with the trace list. Trace IDs
  in the map summary open the shared trace peek. The summary area collapses when
  inactive and fits its content up to a scrollable maximum height. Cards own
  topic filtering, with All topics in the map header to reset it. Topic selection is
  shared with the cards and list and fits the plot to that topic's points, making
  overlapping groups easier to inspect. Arrow keys navigate a single roving tab
  stop; Enter or Space keeps a point selected. The plot uses the measured viewport
  and rotates the cohort's principal axis horizontally, then applies one uniform
  scale to preserve all relative 2D distances. Topic zoom retains the cohort's
  orientation. The shared element-size hook owns the ResizeObserver lifecycle;
  geometry is derived during render. Saved coordinates and clustering are unchanged.
  Missing-coordinate warnings remain visible below the map.
- `server/currentResults.ts` joins latest per-trace/facet assignments to their
  exact topic versions, including assignments from older maps. Terminal no-topic
  assignments clear previous topic membership. A newer usable summary without an
  assignment shows as pending while preserving the previous assignment. Latest
  facet summaries provide accumulated-cohort/readiness counts. This view exports
  no embedding vectors; the scatter remains the latest map's discovery snapshot.
- `server/topicsRouter.ts` owns project authorization and the public result
  contract. The map joins persisted assignment coordinates and summaries by ID
  in the discovery manifest’s order. It returns only map points and counts for
  missing or unpositioned summaries, never embedding vectors.
  History and detail reads reconcile interrupted/queued retries with the queue.
  Resume only enqueues work: the worker exclusively advances existing execution
  journals, including finalization after all facet results have been saved.
  Facet prompt edits create versions independently of saved selection rules.
- `parse-trace-input.ts` validates pasted trace IDs and links without fetching.
  Trace IDs are opaque data; URL path segments are decoded once, while internal
  execution and object-storage identifiers retain the restricted ID format.

The plot is an approximate 2D view, separate from clustering and classification.
It always shows the original discovery cohort. Later assignment batches keep
their results in the list; they are explicitly reported as unpositioned because
the PoC does not retain a UMAP transform. Missing coordinates show an explanation
instead of fabricated points. Missing source summaries do not change the
remaining points' coordinates.

Runtime and numerical pipeline:
[`worker/src/features/topics/README.md`](../../../../worker/src/features/topics/README.md).
