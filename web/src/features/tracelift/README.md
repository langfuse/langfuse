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

The internal **Trace fixes** drawer on Tracing and Observations reads
`issueCounts` for the last 30 days. It displays stored issue counts, not distinct
observations. Loading and query failures are separate from an empty result.
Ingestion costs, fix prompts, and example-observation actions remain hidden when
those values are unavailable. Illustrative findings are used only in Storybook.

The trace viewer's Preview tab reads `byTrace` with pagination and links
observation-level findings to the selected observation. Trace-level findings
are labeled separately. The section requires internal features and project
membership, and is hidden in annotation mode and public trace views.

Enable `LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true` locally and keep the user's
internal features preference enabled. After applying the ClickHouse migration,
open `http://localhost:3000`, choose a project, and open **Tracing → Trace fixes**
or a trace's **Preview** tab. Reads work independently of worker enablement.
Finding population is owned by the worker; the current dummy processor only logs.

Product analytics remain deferred for this internal feature. Issue categories
and identifiers are excluded from session replay using `ph-no-capture`.
