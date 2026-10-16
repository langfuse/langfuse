# Topics UI

Topics requires explicit opt-in through **Profile → Feature Previews → Langfuse
Topics**. Only platform administrators see or change this personal flag. The
sidebar, direct page, and Topics API also require deployment enablement and
project permissions. Processing additionally requires the project allowlist.

- `TopicsPage.tsx` owns facet configuration, the execution history drawer,
  the current-results query and facet selection. A compact header keeps the facet
  picker, time range and processing action on one row; configuration, history and
  refresh live in the overflow menu. `CurrentTopics.tsx` owns the map query and
  trace navigation; `CurrentTopicsView.tsx` presents the selected
  facet in independently scrolling, resizable panels: map and groups on the left,
  traces on the right. Both splits use the shared `useDefaultLayout` helper with
  localStorage preferences shared across facets and projects, with separate
  map-height preferences for desktop and narrow layouts. Narrow views keep
  the resizable map above Topics/Traces tabs, with readable
  summary rows on phones and all processing controls in the mobile overflow
  menu. Selecting a group filters traces without changing the active tab.
  `useTopicTraceFilters.ts` owns URL-backed facet selection; filters and search
  live only in localStorage, scoped to each project/facet. Switching facets
  restores that facet's state, defaulting to unfiltered on first visit. Filter
  and search URL parameters are neither read nor written.
  `TopicsTraceToolbar.tsx` uses the shared search bar for topic, assignment, and
  text filtering. `topic-trace-filters.ts` owns its registry and local evaluation:
  literal phrase search across summaries, topic names and trace IDs, OR within
  a selection and AND between fields. Filtering applies before pagination.
  Saved topic IDs absent from current options remain editable as unavailable
  topics; their matching semantics are preserved across date-range changes.
  Table results determine matching map IDs without changing saved positions or
  the camera; nonmatching dots remain faint and inspectable. The map reports
  its own matching count because its saved cohort can differ from current rows.
  Fit/Home/Escape retain table filters; editing or removing search tokens updates
  the same saved facet state. Search actions reuse metadata-only filter analytics with
  `tableName: topics` and `isV4: false`. Query text and topic names remain
  blocked from replay by the shared search bar.
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
  Manual processing opens a shared dialog with Summarize traces & embed and
  Generate topics tabs. `DialogController` owns the overlay above the page and
  the mobile actions menu. Once models are configured, Configure Topics lives
  in the overflow menu. `ManualTopicsDialog` is the presentational layout shared
  by the app and its isolated `ManualTopicsDialog.stories.tsx` stories.
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
  Without a compatible map, summaries wait for an explicit Update topics run.
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
