# Topics UI

Web owns configuration, map and snapshot controls, and result exploration. Processing and storage contracts live in the [worker README](../../../../worker/src/features/topics/README.md).

## Access

Topics is a beta feature available on every deployment. The page, sidebar, in-app agent, and tRPC routes use [topicsAccess.ts](topicsAccess.ts) to check `topics:read`. Mutations additionally require `topics:CUD`.

The [public API](server/publicApi.ts) and MCP tools accept project-scoped API keys with `topics:read`. The public API resource contract is defined in [Fern](../../../../fern/apis/server/definition/unstable/topics.yml).

## Results and maps

- [TopicsMapPicker.tsx](TopicsMapPicker.tsx) switches the page between maps via `?map=rule:<id>` or `?map=analysis:<executionId>` ([topic-maps.ts](topic-maps.ts)). A rule map is live and lists only traces its run assigned; an analysis is a fixed snapshot. [TopicSliceDialogController.tsx](TopicSliceDialogController.tsx) owns the New map and New snapshot dialogs (map picker footer, or the ⋮ menu while onboarding hides the picker) and the Edit map dialog (header button). It also owns Refresh map (top right of a live map's preview card in the picker; on phones, a footer entry for the selected map; not snapshots), which calls `topics.refreshRuleMap`; the maps overview reports each rule's `refresh` (running, cooldown). Opening the picker loads the estimated cost for the previewed map or snapshot. A live map combines its share of summary and embedding costs with the naming costs of topic versions its fits created. Only maps that requested a summary share its price. Reusing a summary or topic version leaves its cost with its original owners. Missing prices and results can understate the estimate, and duplicate records can overstate it. The first live preview loads all live map costs in one request. Snapshot previews share their run-cost cache with history and run details. The client caches live map and completed snapshot estimates for five minutes.
- [server/currentResults.ts](server/currentResults.ts) separates approximate per-facet/topic counts from paged trace rows. The page has no time picker; each facet's window starts at its published map's cohort start, bounded by `TOPICS_MAX_TIME_RANGE_MS`, and ends now. Without a map it uses the last seven days.
- Current assignments belong to the published run and must match the current summary's facet version and processing time. An older map's assignment does not make a trace assigned in the current results.
- [useFacetTopicTraces.ts](useFacetTopicTraces.ts) injects server pagination into the views; stories inject fixture rows. Follow `nextCursor`, including on short pages. Selected traces outside loaded pages can be fetched separately and pinned. Search matches topic names or an exact trace ID, not summary text.
- The map is the published run's original discovery cohort, with saved coordinates and the latest available summary text. Later assignment batches appear in trace lists, not as new map points. Missing summaries must not reposition other points. The map response contains no embedding vectors.
- [scatter/TopicMapExplorer.tsx](scatter/TopicMapExplorer.tsx) renders supplied data; clustering stays outside the browser. Coordinates remain fixed world centers during zoom and pan. Decorative zones, depth, and halos do not encode quality or introduce another clustering hierarchy. Keep summary content replay-blocked.
- [TopicTreemap.tsx](TopicTreemap.tsx) zooms with a pinch or Ctrl/⌘ + scroll by multiplying the layout height at a fixed width and laying the tiles out again: relative areas hold, positions may shift (the tile under the pinch or cursor stays under it), and the treemap grows downward so every tile stays reachable by scrolling its panel. It never pans: a pinch only zooms, and one-finger touch and plain scroll stay native.
- [scatter/TopicMapCanvas.tsx](scatter/TopicMapCanvas.tsx) owns animation through the per-mount map store. Canvas, DOM overlays and hit testing must use the same painted frame; reduced-motion mode skips interpolation and parallax.

## State and execution boundaries

- [TopicsPage.tsx](TopicsPage.tsx) owns dialogs and history; [CurrentTopics.tsx](CurrentTopics.tsx) selects desktop/mobile renderers and owns result queries. Opening history keeps the results workspace mounted.
- On completion, `useCurrentTopics` must issue a fresh counts request and reset trace pagination; an older in-flight poll cannot satisfy that refresh. Polling a busy run preserves already-loaded trace pages.
- [useTopicTraceFilters.ts](useTopicTraceFilters.ts) owns URL-backed facet selection and filters stored per project/facet in localStorage. Desktop map selection uses its own project-scoped session entry and stays across facet changes even when the destination cannot show it. Mobile trace selection uses a separate project-scoped entry: the same facet keeps it across reloads, and a facet change clears it. `TopicMobileTraceList` opens the page that contains a newly selected trace, including after that row finishes loading, and leaves a manually chosen page in place. Mobile charts preview on first tap and select on the second; the trace list opens peek.
- [server/traceSelection.ts](server/traceSelection.ts) uses the shared bounded selector for preview and submission. Preview calls no models and is not a snapshot: the server resolves trace IDs again at submission, and source content can change before the worker reads it. Preserve the reviewed time bounds and exclusions; selection predicates match one observation, while processing loads the containing trace.

For setup changes, start with [TopicSetupFlowController.tsx](TopicSetupFlowController.tsx) and [useTopicSettings.ts](useTopicSettings.ts).
