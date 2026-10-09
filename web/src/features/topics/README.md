# Topics UI

Topics requires explicit opt-in through **Profile → Feature Previews → Langfuse
Topics**. Only platform administrators see or change this personal flag. The
sidebar, direct page, and Topics API also require deployment enablement and
project permissions. Processing additionally requires the project allowlist.

- `TopicsPage.tsx` owns facet configuration, the execution history drawer,
  the current-results query and facet selection. A compact header keeps the facet
  picker, time range and processing action on one row; configuration, history and
  refresh live in the overflow menu. `CurrentTopics.tsx` presents the selected
  facet in independently scrolling panels: map and groups on the left, traces on
  the right. Narrow views keep the map above Topics/Traces tabs, with readable
  summary rows on phones and all processing controls in the mobile overflow
  menu. Selecting a group filters traces without changing the active tab.
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
  Configure topics opens a centered dialog; Process traces or Update topics
  submits the retained configuration. Overlay owners stay outside the responsive
  header menu. Facet versions contain only prompts; processing settings and
  embedding dimensions are frozen on executions. Built-in facets are read-only;
  custom facets can be revised by creating a new prompt version.
- `useTopicPipelineForm` owns the configuration dialog, operation, facet versions
  and submission. The workspace renders its header actions and dialog separately;
  configuration changes preserve the current results and selection. Its state
  stays mounted when the dialog closes. Preview trace clicks close
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
  Expanding Trace errors loads failed trace IDs and reasons on demand from
  retained queue state. When it expires, the UI says so; permanent counts remain.
  Saved topic rules hold reusable filters and stable facet IDs. Selecting a rule
  loads its filters and each facet's latest prompt version; editing filters or
  facets becomes an ad hoc run until explicitly saved. Sampling and its limit stay
  specific to each execution and are retained when switching saved rules. Rules
  do not create separate maps or invalidate summaries and embeddings.
  These local PoC operations and rule saving add no product analytics event.
- `useTopicTraceSelector` reuses the eval filter builder and query editor, with
  a time range, all matching traces selected by default, and optional random/latest
  sampling with a user-chosen size. Selecting a rule or changing the operation
  resets the trace-selection draft while retaining sampling settings; dates stay
  specific to each execution.
  The hook supplies selection, criteria and controls so the dialog can unmount
  without losing the reviewed cohort. Explicit preview counts the cohort;
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
- `SummaryInspector.tsx` displays the current transcript for a saved summary.
  The current-results table owns its dialog and fetches only when inspection is
  open. It uses the same deterministic transcript loader as the worker, does
  not run inference, and explains when the source is unavailable or may differ
  from the original input. Transcript content is marked `ph-no-capture`.
- `TopicEmbeddingMap.tsx` loads the published map and supplies trace navigation.
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
  Unpositioned summaries remain available in the trace table. This internal PoC
  adds no
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
  Current results return summaries and their applicable assignments; inspection
  accepts a saved summary identity scoped to the project. Maps read their original
  discovery cohort and coordinates while summary text reflects the latest stored
  result. These reads survive transient job state expiry.
  Resume requeues retained job inputs; if they have expired, start a new run.
  Facet prompt edits create versions independently of saved selection rules.
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
