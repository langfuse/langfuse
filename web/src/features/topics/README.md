# Topics UI

Web owns configuration, manual run controls, and result exploration. Processing and storage contracts live in the [worker README](../../../../worker/src/features/topics/README.md).

## Access

[topicsAccess.ts](topicsAccess.ts) is the shared visibility gate for the page, sidebar, and tRPC routes: the project must pass the deployment/allowlist gate, the user must have Internal view or the `langfuseTopics` personal flag, and `topics:read` permission. Mutations additionally require `topics:CUD`. Personal-toggle rules belong to the [feature flags docs](../feature-flags/README.md).

The [public API adapter](server/publicApi.ts) uses the project gate without a personal flag: API keys have no user session. Its resource contract is defined in [Fern](../../../../fern/apis/server/definition/unstable/topics.yml).

## Results and maps

- [server/currentResults.ts](server/currentResults.ts) separates approximate per-facet/topic counts from paged trace rows. The page has no time picker; each facet's window starts at its published map's cohort start, bounded by `TOPICS_MAX_TIME_RANGE_MS`, and ends now. Without a map it uses the last seven days.
- Current assignments belong to the published run and must match the current summary's facet version and processing time. An older map's assignment does not make a trace assigned in the current results.
- [useFacetTopicTraces.ts](useFacetTopicTraces.ts) injects server pagination into the views; stories inject fixture rows. Follow `nextCursor`, including on short pages. Selected traces outside loaded pages can be fetched separately and pinned. Search matches topic names or an exact trace ID, not summary text.
- The map is the published run's original discovery cohort, with saved coordinates and the latest available summary text. Later assignment batches appear in trace lists, not as new map points. Missing summaries must not reposition other points. The map response contains no embedding vectors.
- [map/TopicMapExplorer.tsx](map/TopicMapExplorer.tsx) renders supplied data; clustering stays outside the browser. Coordinates remain fixed world centers during zoom and pan. Decorative zones, depth, and halos do not encode quality or introduce another clustering hierarchy. Keep summary content replay-blocked.
- [map/TopicMapCanvas.tsx](map/TopicMapCanvas.tsx) owns animation through the per-mount map store. Canvas, DOM overlays and hit testing must use the same painted frame; reduced-motion mode skips interpolation and parallax.

## State and execution boundaries

- [TopicsPage.tsx](TopicsPage.tsx) owns dialogs and history; [CurrentTopics.tsx](CurrentTopics.tsx) selects desktop/mobile renderers and owns result queries. Opening history keeps the results workspace mounted.
- On completion, `useCurrentTopics` must issue a fresh counts request and reset trace pagination; an older in-flight poll cannot satisfy that refresh. Polling a busy run preserves already-loaded trace pages.
- [useTopicTraceFilters.ts](useTopicTraceFilters.ts) owns URL-backed facet selection and filters stored per project/facet in localStorage. Map/mobile trace selection uses project-scoped session storage. Preserve selection across facet changes even when the destination cannot show it. Mobile charts preview on first tap and select on the second; the trace list opens peek.
- Manual request IDs and mutation errors outlive the dialog so retrying an unchanged failed request cannot create a duplicate execution. See [TopicPipelineForm.tsx](TopicPipelineForm.tsx) and [useRegenerateTopics.ts](useRegenerateTopics.ts).
- [server/traceSelection.ts](server/traceSelection.ts) uses the shared bounded selector for preview and submission. Preview calls no models and is not a snapshot: the server resolves trace IDs again at submission, and source content can change before the worker reads it. Preserve the reviewed time bounds and exclusions; selection predicates match one observation, while processing loads the containing trace.

For setup changes, start with [TopicSetupFlowController.tsx](TopicSetupFlowController.tsx) and [TopicModelSettings.tsx](TopicModelSettings.tsx). For manual runs, start with [ManualTopicsFormContent.tsx](ManualTopicsFormContent.tsx).
