# Tracelift read API

Both tRPC queries require project membership. Shared schemas and types live in
`@langfuse/shared`; the query functions live in `@langfuse/shared/src/server` so
other authenticated adapters can reuse them. MCP is not exposed yet.

## Trace viewer

```ts
api.tracelift.byTrace.useQuery({ projectId, traceId, page: 0, limit: 50 });
```

Returns `{ issues, hasMore }`, including trace-level findings (`observationId:
null`) and observation-level findings. Pages are zero-based; limit defaults to 50
and is capped at 100. Results sort newest first with stable tie-breakers.
Optional `fromTimestamp` and `toTimestamp` narrow the lookup when the viewer knows
the trace's time range. Bounds use the trace start timestamp stored on the finding,
not the observation start time or detection time.

## Dashboard callouts

```ts
api.tracelift.issueCounts.useQuery({
  projectId,
  fromTimestamp: weekAgo,
  toTimestamp: now,
});
```

Returns `{ totalCount, counts: [{ issue, count }] }`, sorted by count descending.
Both timestamps are required; the interval is inclusive at the start and exclusive
at the end. These are stored finding counts, not distinct trace counts. Multiple
findings on one trace and duplicate inserts each contribute to the count.

Reads do not depend on the worker's Tracelift flags, so disabling detection does
not hide stored findings. Apply the `0051_add_tracelift_issues` migration before
using either endpoint.

## UI

The internal **Instrumentation suggestions** drawer reads `issueCounts` for the
last 30 days. The drawer and trace detail section only display categories in the
shared `TraceIssue` enum. Counts represent stored findings, not distinct spans.

`TraceliftDrawerContent` owns fetching, category filtering, and navigation.
`issuePresentation` maps supported categories to suggestions and prompt context.
`TraceliftPanelContent` owns the combined prompt and clipboard feedback;
`TraceliftFindingSection` renders each suggestion and its example links.
The assistant action prefills a draft and is hidden when unavailable.

Only infrastructure suggestions show savings: an illustrative $6 per 100,000
excluded observations. We do not multiply finding counts by this rate: the API
does not provide the removable span volume needed for a project-specific total.

Enable `LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true` and the user's internal
features preference. Open **Tracing → Instrumentation suggestions**. The trace
viewer's Preview tab also shows supported suggestions, with pagination.
Storybook uses illustrative examples only; no customer data is required.

Product analytics remain deferred for this internal feature. Identifiers and
prompt contents are excluded from session replay using `ph-no-capture`.
