# Topics UI

Topics requires explicit opt-in through **Profile → Feature Previews → Langfuse
Topics**. Only platform administrators see or change this personal flag. The
sidebar, direct page, and Topics API also require deployment enablement and
project permissions. Processing additionally requires the project allowlist.

- On phones (including touch-screen landscape), `CurrentTopics.tsx` renders `MobileTopicsView`: full-height Topics, Traces, and Visualize panels instead of concurrent split panes. `TopicsMobileControls` keeps facet/view selection in the page; the mobile menu includes automatic processing. Selecting a topic opens its traces; changing visualization opens Visualize. All traces and Unassigned remain reachable without selecting tiny chart marks. Filters stay in `useTopicTraceFilters`, trace selection in project session storage, and panel navigation stays local to the mounted project. No mirrored query state or additional store is needed for these low-frequency interactions. `prepare-topic-display.ts` owns display topics, Unassigned counts, and colors shared with desktop Treemap. `prepare-mobile-topics.ts` adds selection and matching rows; `TopicMobileList` and `TopicMobileTraceList` render explicit props. Trace cards wrap full summaries and use design-system pagination, initially 20 per page. Facet/view controls use the compact design-system SelectInput. Their header and search scroll with the cards so short screens retain access to every row. `MobileTopicVisualization` composes the same `TopicTreemap`, `TopicGrid`, and `TopicEmbeddingMap` renderers as desktop. `prepare-topic-grid.ts` owns the shared grid preparation; parents own chart dimensions. Mobile renderers use `previewOnSelect`: first tap shows persistent hover details, a second tap on the same item selects it and opens Traces. Tapping a different item replaces the preview; tapping empty space dismisses it. Only a trace-list tap opens peek. Map pan/zoom invalidates the preview. Storybook composes the mobile explorer with its facet/view controls; desktop charts retain their stories. The mobile flow shares one page shell across visualizations; chart insets belong inside their visualization, never around the page controls or panel navigation. The flow uses existing view-selection analytics and the same replay-blocked content boundaries; it adds no events for local panel navigation.
- `prepare-topics-actions.ts` defines labels, processing status, availability, and callbacks once for the inline header and both overflow menus. The view adapters own menu dismissal and presentation; the page owns dialog lifetimes.
- `TopicsPage.tsx` owns facet configuration, the execution history drawer,
  the current-results query and facet selection. The header shows the facet
  tabs, then "Visualize as" (`TopicsResultsViewSelect.tsx`) with Treemap
  (default), Grid and Map, remembered in localStorage; time range and processing
  actions sit on the right, configuration and history in the overflow menu.
  `CurrentTopics.tsx` owns the map query (Grid and Map) and trace navigation.
  Treemap sizes one tile per topic by trace count, plus a grey Unassigned tile
  for traces without a topic, traces below; Grid snaps the
  saved map projection onto one square per trace (sampled above 1,000), legend
  under it and traces on the right. Both list the selected topic's traces in
  `TopicTraceList`, with an Open in Tracing link limited to those trace IDs.
  Map is the original cluster map (`CurrentTopicsView.tsx`) with its trace table.
  Map clicks select a trace without opening peek. `CurrentTopicsView` keeps
  that trace ID in project-scoped sessionStorage, shared across facets, and
  highlights its map point and table row. Selection changes reveal the trace's
  table page and follow it through result refreshes until the user paginates.
  Clearing selection preserves the current page. Filtered-out map points cannot
  replace selection; filters can hide a selection without discarding it. Table row
  and trace-link clicks select the trace and open peek.
  `useTopicTraceFilters.ts` owns URL-backed facet selection.
  Peek defaults to the trace panel width and has its own resize preference.
  The results workspace stays mounted, including
  while a run's status is open. Execution URL parameters open progress, errors
  and retry controls in the drawer; returning to the run list or closing the
  drawer removes only that parameter. Historical map comparison is not exposed.
  Current results poll while work runs, including a selected run outside recent
  history. Once idle, a status response selects a fresh results query so an older
  in-flight poll cannot satisfy completion. The query retains the tRPC prefix
  for mutation and manual invalidation.
  The polling/completion race is covered directly by a frontend hook test.
  Configure Topics opens a dialog for models, facets, and which traces to run.
  Saving it stores the models, creates the four built-in facets as evaluators
  with a first version, and saves one rule for the filter, idle time, and
  sampling rate. A project can have only one Topics rule.
  The header shows the auto-analyze status (`AnalyzeControl`); clicking it opens the Analyze traces dialog with the auto-analyze toggle and sample rate. The overflow menu holds Regenerate topics, History and Settings, plus a Show unassigned toggle (on by default, kept in project-scoped sessionStorage); turning it off makes `CurrentTopics` drop traces and map points without a topic, removing the Unassigned tile and the Outliers and awaiting-assignment map zones in every view. Regenerate topics opens the shared manual dialog on its Generate topics tab; the Summarize traces & embed tab stays reachable there. `DialogController` owns the overlay above the page and the mobile actions menu. `ManualTopicsDialog` is the presentational layout shared by the app and its isolated `ManualTopicsDialog.stories.tsx` stories.
  `TopicTraceSelectorView` renders the same filters, batch controls and preview
  table in both places; stories supply fixture results without private API calls.
  `ManualTopicsFormContent` owns the draft and uses the real trace selector.
  `manualTopicsSelection` owns selection readiness for both operations, shared
  by the application and Storybook interaction tests. `useTopicPipelineForm` owns process writes;
  `useRegenerateTopics` owns active/latest facet counts and generate writes.
  Mutation errors and request IDs outlive dialog dismissal, so retrying an
  unchanged request does not create a second run. Submission closes the dialog
  and opens the existing execution progress drawer. Permission, setup, pause,
  availability and running-state gates disable submissions; generation also
  requires compatible stored summaries. Facet versions contain only prompts;
  processing settings and embedding dimensions are frozen on executions.
  Built-in facets are read-only; custom facets are added on their own page.
- Manual processing defaults to all active built-in and custom facets in the
  Topics rule at their latest version. Summarize traces & embed is the default
  tab: it summarizes, embeds, and assigns only the previewed batch to current
  topics. Trace selection includes filters, IDs, time ranges, a maximum batch size,
  and exclusions. Stored summary and embedding reuse is enabled by default in Review & Run.
  The dialog uses the evaluator stepper: Choose facets, Select traces, and
  Review & Run. Generate topics uses Select trace summaries for the second step;
  its time range filters by the trace start time. Both manual-processing pickers
  limit custom ranges to 90 days, matching the Topics header.
  All steps start expanded; model details and reuse settings live in review.
  Preview trace clicks open a new tab, preserving the run dialog and selection.
  Without a compatible map, summaries wait for an explicit Regenerate topics run.
  Generate topics defaults to compatible summaries from the past seven days,
  with its picker limited to a maximum thirty-day range. Its own time-range
  picker uses the same frozen range for counts and submission, independently of
  the page and raw trace filters. Generate topics reads compatible stored summaries directly; each selected facet
  shows its available summary count. It has clustering settings but no trace
  picker, source-execution selector, or target-map selector. Embedding dimensions
  are configured per execution; updates select matching stored embeddings and
  never regenerate them. History and progress responses omit trace IDs, summary
  IDs, and per-trace errors, using aggregate counts for progress.
  Expanding Trace errors loads failed trace IDs and reasons on demand from
  retained queue state. When it expires, the UI says so; permanent counts remain.
  The run dialog chooses facets and traces for one run. It does not save that
  choice. Sampling and its limit stay specific to each execution.
  These local PoC operations add no product analytics event.
- `useTopicTraceSelector` reuses the eval filter builder and query editor, with
  a time range and random/latest sampling with a user-chosen size. Manual runs
  default to at most 1,000 traces, enforced at the web API boundary for filters
  and pasted IDs. `backfill-limit.ts` owns this fixed PoC limit. Changing the operation resets the
  trace-selection draft while retaining sampling settings; dates stay specific
  to each execution.
  The hook supplies selection, criteria and controls so the dialog can unmount
  without losing the reviewed cohort. Explicit preview counts the cohort;
  changing criteria invalidates it. Rows can be excluded across preview pages.
  The form submits reviewed criteria and exclusions. Paste IDs remains available.
  `server/traceSelection.ts` applies canonical observation filters within a
  maximum 93-day window, then deduplicates traces before counting and optional
  sampling. Manual processing is capped at 1,000 traces per run. Preview rows and current results render
  in pages of 20; selected IDs are frozen by the server at submission. All predicates match
  the same observation; the worker reads the
  whole containing trace, including observations outside the selection window.
  Preview only reads identifiers and display metadata and never calls a model.
  Matching counts can change between preview and submission, and source trace
  content can change before the worker loads it. Preview responses are not a
  historical trace snapshot.
- `TopicEmbeddingMap.tsx` renders the published map's loading, error and ready states
  from supplied query data and trace-navigation callbacks.
  `EmbeddingMapView.tsx` preserves the controlled selection contract as a drop-in
  adapter to `map/TopicMapExplorer.tsx`. The renderer owns no queries or clustering.
  `map/prepare-topic-map.ts` prepares topic zones, colors, mapped-cohort counts,
  camera geometry and collision-bounded node footprints. Saved coordinates are
  the fixed world centers at every zoom; fitting and camera movement use one
  uniform scale. Zones represent existing topics, not a new clustering hierarchy;
  halos and deterministic depth are decorative, not density, severity or quality
  measures. Subtle pointer parallax fades as detail grows; it does not change
  stored positions, topic membership or the spatial arrangement.
  The bird's-eye cloud keeps group labels hidden. Only individual traces show
  hover hints; group context comes from the in-space labels. Each trace grows around
  its fixed center, retaining a filled abstract shape until its actual footprint
  allows summary text. Text starts small, increases with available space and
  fades in as the shape becomes a rounded card. Neighbor
  clearance constrains expansion, including foreign and offscreen neighbors.
  Dense or coincident points keep their hover and trace-table paths. Zoom can reach
  128 times the fitted overview so dense regions can reveal detail without packing
  points into a grid. Background text contains only existing group names and
  descriptions, including Outliers, with one label per group. Labels follow fixed
  zone centers and stay within the visible part of each zone as users pan and
  zoom. Overlapping labels fade instead of searching for new positions.
  Hover hints fade and scale gently while summaries lack inline space. These
  translucent hints always ignore pointer events, so moving across them targets
  the underlying map. Inline trace content remains selectable. Camera movement
  clears hover until fresh physical pointer movement, and the same painted frame
  supplies Canvas, inline content and hit testing. Zone selection uses a slow
  eased camera flight, including selection from the group panel. Hover never
  changes the map layout. Clicking a trace opens peek directly; trace-table links
  also expose dense and coincident points without mounting thousands of focusable
  dots.
  `map/TopicMapCanvas.tsx` interpolates camera, pointer parallax and hover emphasis
  via a frame-batched subscription to a per-mount vanilla store. Inline summaries,
  background text and animated hover hints subscribe to its shared presentation.
  The measured stage fills its container and expands with native browser fullscreen,
  retaining the camera. Opening a trace exits fullscreen before using the peek panel.
  `usePanZoomGestures` shares wheel input with the timeline: scroll pans, pinch or
  Ctrl/Command-scroll zooms at the pointer, and two touch contacts pinch and pan.
  Drag capture starts after a threshold so clicks remain clicks. Arrow keys pan,
  +/- zoom and 0/Home return to the full map. Zoom, fit and fullscreen controls
  overlay the chart without reserving a header row. OS reduced motion disables focus
  flights, presentation interpolation and pointer parallax, with immediate hints.
  Unpositioned summaries remain available in the trace table. The compact mapped-count
  tooltip reports points without summaries and summaries without coordinates, without
  reserving a footer row. This internal PoC adds no
  analytics events for camera/hover/fullscreen; the entire renderer is blocked
  from session replay. Browser fullscreen denial is expected UI state.
- `server/currentResults.ts` joins latest per-trace/facet assignments to their
  exact topic versions, including assignments from older maps. Summary states
  identify terminal no-topic results. An assignment applies only when its stored
  summary processing time matches the current summary; a newer usable summary
  waits for classification and clears the previous displayed membership. Each trace
  uses its latest processed facet version, even when a newer version has not been
  processed. Readiness counts include only the current facet version. This view exports
  no embedding vectors; the scatter remains the latest map's discovery snapshot.
- `server/topicsRouter.ts` owns project authorization and the public result
  contract. The map joins persisted assignment coordinates and summaries by ID
  in the persisted discovery cohort’s order. It returns only map points and counts for
  missing or unpositioned summaries, never embedding vectors.
  History and detail reads reconcile interrupted/queued retries with the queue.
  Current results return summaries and their applicable assignments. Maps read
  their original discovery cohort and coordinates while summary text reflects the
  latest stored result. These reads survive transient job state expiry.
  Resume requeues retained job inputs; if they have expired, start a new run.
  Facet prompt edits are a separate page from this setup.
- `parse-trace-input.ts` validates pasted trace IDs and links without fetching.
  Trace IDs are opaque data; URL path segments are decoded once, while internal
  execution identifiers retain the restricted ID format.

The plot is an approximate 2D view, separate from clustering and classification.
It always shows the original discovery cohort. Later assignment batches keep
their results in the trace table because the PoC does not retain a UMAP
transform. The map only renders saved coordinates; missing source summaries do
not change the remaining points' coordinates.

Runtime and numerical pipeline:
[`worker/src/features/topics/README.md`](../../../../worker/src/features/topics/README.md).
