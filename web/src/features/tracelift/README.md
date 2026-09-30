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
