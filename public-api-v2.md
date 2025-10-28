# RFC Faster Public APIs

in this proposal APIs we are targeting:

* `/public/traces/*`
* `/public/observatons/*`
* And to a smaller extent `/public/metrics/*`

aiming to improve performance and align them with the events table data model.

# How customers use our public/traces APIs

* Getting all of their data out. For example they may want to run ETL into their own DWH and perform their own aggregation on top.
  **Approach** -> advise to use batch exports on Team+ tiers. Otherwise nudge towards observations API.
* To run their own evals. In order to do so, first they need to list recent traces, then get data for those.
  **Approach** -> poll `/public/v2/observation`
  * Extended with cursor-like parameter (see. below allows to continue from the last row previously received)
*
  * Advise to filter down to "top level" spans only (or to apply any other "span of interest" filter).
* Ad-hoc analysis on traces. E.g. getting the most expensive traces / spans
  **Approach** -> advise to use metrics API
  * Possibly requires extending metrics API with appropriate filters, groupings. The most notable example of something we can't do yet via current metrics API is producing a table similar to the UI traces table complete with IO and aggregates. We can address this in a number of ways, see below.
* To get all observations for a given `trace_id`
  **Approach** -> Initially, nudge towards using observations endpoint with filter by `trace_id`. Possibly extend later.

# General principles

The overarching idea of this redesign is to minimize the work Langfuse platform has to perform per query. To that end, all `v2` endpoints should adhere to the following set of behaviors:

* Don't return data that wasn't requested. E.g. `/public/observations` returns a complete rows with IO, usage, etc. This forces ClickHouse to scan every column, even if particular customer query doesn't use it.  All `v2` queries are to include required `fields: string\[\]` parameter.
  * Note, `/public/traces` already supports `fields` parameter, but its behavior is reversed: by default it includes all fields, including nested spans. With the suggested change customers would be forced to specify fields.
* Presently, we don't enforce limit parameter and have lax defaults (1000 rows). Moving forward we should tighten default limit on every `/public/v2` endpoint (e.g. 50-100) and additionally disallow limits larger than e.g. 1k or 10k.
* When `input` and `output` fields are included in the response of `v1` endpoints we always attempt to parse their content using `lossless-json` which could be expensive. All `/public/v2` are to return IO as strings by default unless an optional `parseIoAsJson: true` parameter is specified.

# Observations

`GET /public/v2/observations`

or, to allow larger queries:

`POST /public/v2/observations`

with JSON body

**Parameters:**

| param | type | description |
| -- | -- | -- |
| `limit` | `integer | null` | Limit of items per page.  Defaults to 50 when not specified. Max allowed value is 10k. (Perhaps even 1k). |
| `fromStartTime` | `date-time | null` | Retrieve only observations with a `startTime` on or after this datetime (ISO 8601). No specific time by default, the output is capped by `limit` |
| `toStartTime` | `date-time | null` | Retrieve only observations with a `startTime` before this datetime (ISO 8601). Default is `now()` |
| `rollups` | `MetricsQueryObject` or similar | When `rollups` is present both `fromStartTime` and `toStartTime` parameters are required. Rollups are defined similar to metrics. And the following rollup config:{
  "metrics": \[{"measure": "total_cost", "aggregation": "sum"}\],
  "dimensions": \[{"field": "trace_id"}\]
}will result in `total_cost_sum` column in the response. |
| `rawFilters`  | `FilterState` | Raw filter expression (same as on metrics endpoint). Allows more expressive filtering and access to more fields (e.g. metadata) but is more complicated to use.

Raw filters may reference columns from rollups. E.g. `total_cost_sum > 0.5` from the example above.

If any of the top level filters are specified, they will override a corresponding clause of the raw filter expression |
| `name` | `string | null` | (Same as before) |
| `userId` | `string | null` | (Same as before) |
| `sessionId` | `string | null` | (Same as before) |
| `type` | `string | null` | (Same as before) |
| `traceId` | `string | null` | (Same as before) |
| `level` | `enum` | (Same as before) |
| `parentObservationId` | `string | null` | (Same as before) |
| `environment` | `string[] | null` | Optional filter for observations where the environment is one of the provided values.(Same as before) |
| `version` | `string | null` | Optional filter to only include observations with a certain version.(Same as before) |
| `highlightedOnly` | `boolean | null` | Optional filter to only include observations marked as "highlighted" via SDK. Defaults to `true`. |
| `topLevelOnly` | `boolean | null` | Optional filter to only include observations without a `parentId`. Defaults to `false`. |
| `withCursor` | `base64 string | null` | If specified overrides `toStartTime`. See [Pagination section](https://linear.app/langfuse/document/rfc-faster-public-apis-3ae746782e75#untitled-8e91292f) |
| `fields` | `string[]` | ***Required*****.**Comma-separated list of fields to include in the response. See top level field names [`/api/public/observations`](https://api.reference.langfuse.com/#tag/observations/get/api/public/observations). |
| `parseIoAsJson` | `boolean | null` | Specifies whether to attempt parison `input` and `output` as JSON. Defaults to `false`. |

**Response**

```
{
  "data": [
    {
      "id": "string",
      "traceId": "string" | null,
      "type": "string",
      "name": "string" | null,
      "startTime": "2025-09-17T14:57:54.272Z",
      "endTime": "2025-09-17T14:57:54.272Z" | null,
      "completionStartTime": "2025-09-17T14:57:54.272Z" | null,
      "model": "string" | null,
      "modelParameters": {} | null,
      "input": "string" | {} | null,
      "version": "string" | null,
      "metadata": {} | null,
      "output": "string" | {} | null,
      "level": "DEBUG" | "DEFAULT" | "WARNING" | "ERROR",
      "statusMessage": "string" | null,,
      "parentObservationId": "string" | null,,
      "promptId": "string" | null,
      "usageDetails": {"metric": "value"} | null,
      "costDetails": {"metric": "value"} | null,
      "environment": "string" | null,
    },
    ...
  ],
  "meta": {
    "cursor": "base64string" | null // see the next section
  }
}
```

Items in the `data` array are always sorted by `startTime` descending (from the latest to oldest).

## Cursor based pagination

When the expected amount of observations is substantial users might prefer a paginated response. In the `v1` the pagination was based on numbered pages. That approach has a couple of downsides: firstly it is impossible to derive from a page number alone what rows have been processed previously and can be skipped, thus we forced ClickHouse to perform the amount of work similar to serving a complete (non-paginated) query. Another downside is a potential to miss a row between pages when a result set changes significantly between requests.

In the `v2` we can utilize the `toUnixTimestamp(start_time)` order of rows in [RFC Data Model: Events Table Schema](https://linear.app/langfuse/document/rfc-data-model-events-table-schema-ee360eae0de9):

* All queries to ClickHouse originating from the `observations` endpoint already include `start_timestamp <= ...` and `LIMIT N` clauses and should be ordered by `start_time` and `id` (both descending)
* When a response is exactly `N` rows long, the endpoint should additionally include `"meta": { "cursor": "base64string" }` in the response, where the `cursor` field is base64-encoded `{"lastStartTimeTo": <startTimeOfLastRow>, "lastId": <idOfLastRow>}`and the "last row" is the last row of the `{"data": […] }` from the response.
* When a client receives a response with `cursor` field, they may choose to include `withCursor` parameter with their next request. If they did so, the next query to ClickHouse can be formed with `start_timestamp <= lastStartTimeTo AND id < <idOfLastRow>`
* In order for `withCursor` to work with rollups we need to additionally compute `min(start_time)` and `max(start_time)` for the rollup. The `rollupStartTimeTo` is picked given the query:
  *
    ```sql
    WITH traceids AS (
      SELECT
        e.trace_id,
        min(e.start_time) AS min_start_time,
        max(e.start_time) AS max_start_time
      FROM events e
      WHERE e.project_id = '<project_id>'
        AND e.start_time >= toDateTime('...')
        AND e.start_time < toDateTime('...')
      GROUP BY e.trace_id
      ORDER BY max_start_time DESC
      LIMIT 10000
    ),
    max_t AS (
      SELECT trace_id, max_start_time
      FROM traceids
      ORDER BY max_start_time DESC
      LIMIT 1
    ),
    min_t AS (
      SELECT trace_id, min_start_time
      FROM traceids
      ORDER BY min_start_time ASC
      LIMIT 1
    )
    SELECT max_t.trace_id, min_t.trace_id, max_start_time, min_start_time
    FROM max_t, min_t;
    ```
  * If and only if `max_t.trace_id` ≠ `min_t.trace_id` the cursor may advance `rollupStartTimeTo < max_start_time`. Otherwise it must remain `<= max_start_time`.

The approach outlined above allows us return data piecewise while reducing the amount of data ClickHouse has to process per "page" of response.

## Future work

We can further improve SDKs to make use of cursor based pagination by introducing subscription API. Potentially improving DX when polling for recent observations.

# Metrics

Initially the [same API as v1](https://langfuse.com/docs/metrics/features/metrics-api), but on top of [new `events` table](https://linear.app/langfuse/document/rfc-data-model-events-table-schema-ee360eae0de9) and with a tighter default limit (e.g. 100).

We can add IO as a new dimension. It is expensive indeed (1-5 seconds), but not prohibitively so for infrequent use:

```
WITH costs AS (
SELECT
    o.trace_id as trace_id,
    min(o.start_time) as trace_start,
    max(o.end_time) as trace_end,
    sum(o.total_cost) as total
FROM observations o
WHERE o.start_time >= toDateTime('2025-09-12 00:00:00')
AND o.start_time < toDateTime('2025-09-13 00:00:00')
AND project_id = '<khan-redaced>'
GROUP BY 1
ORDER BY total DESC
LIMIT 50),
io AS (
    SELECT o.trace_id as trace_id, argMin(o.input, o.start_time) as input, argMax(o.output, o.start_time) as output
    FROM observations o
    WHERE o.start_time >= toDateTime('2025-09-12 00:00:00')
    AND o.start_time < toDateTime('2025-09-13 00:00:00')
    AND project_id = '<khan-redacted>'
    AND o.trace_id IN (SELECT trace_id FROM costs)
    AND (isNotNull(o.input) OR isNotNull(o.output))
    GROUP BY 1
)
SELECT c.trace_id, c.total, io.input, io.output
FROM costs c LEFT JOIN io USING trace_id
ORDER BY 2 DESC;
```

Or with IO CTE reformulated for `events` table

```
    SELECT
        o.trace_id as trace_id,
        anyIf(o.input, isNotNull(o.input) AND notEmpty(o.input)) as input,
        anyIf(o.output, isNotNull(o.output) AND notEmpty(o.output)) as output
    FROM events o
    WHERE o.start_time >= toDateTime('2025-09-12 00:00:00')
        AND o.start_time < toDateTime('2025-09-13 00:00:00')
        AND project_id = '<khan-redacted>'
        AND o.trace_id IN (SELECT trace_id FROM costs)
        AND (isNotNull(o.input) OR isNotNull(o.output))
        AND (notEmpty(o.input) OR notEmpty(o.output))
    GROUP BY 1
```

E.g. the query above (top 50 traces by cost for 1 day with IO) typically returns under 1-2 seconds with IO fields contributing significantly to the total runtime.

And we can further experiment by fetching IO in a separate query (0.6-2.5s for 10 items):

```
SELECT o.trace_id as trace_id, any(o.input) as input, any(o.output) as output
FROM observations o
WHERE o.start_time >= toDateTime('2025-09-14 00:00:00')
AND o.start_time < toDateTime('2025-09-15 00:00:00')
AND project_id = '<khan-redaced>'
AND o.trace_id IN (
  ...
)
AND (isNotNull(o.input) OR isNotNull(o.output))
GROUP BY 1;
```

Options:

* For the UI load IO asynchronously after computing metrics and obtaining `trace_id`s for the top traces.
* API
  * Accept higher latency if user chooses this extension and implement
  * Limit API capabilities. Ask users to pull it out of `/public/v2/observations`
  * Point towards `rollups` parameter in `/public/v2/observations`

# Traces

As you may have noticed in the use case breakdown section, we expect nearly every use case to be served either via `/observations` or `/metrics`. Therefore v2 API will not initially include `/public/v2/traces` endpoint. In the Otel world not every product provides such interface. E.g. DataDog doesn't while [Grafana Tempo — does](https://grafana.com/docs/tempo/latest/api_docs/#query-v2). It is certainly possible to build it should there be an appetite.  Although this requires langfuse to be able to efficiently derive `start_` and `end_timestamp` for a given `trace_id`.

An idea how to do so without significantly complicating ingestion. Introduce the following AMT materialized view:  `trace_id, toYYYYMMDD(start_time)(partitioning key) ->  min(start_time), max(start_time)`. Then at query, by default expand ±1day from request timestamps. If there is only row — assume there is no more data for that `trace_id`. If more rows received further extend the time interval and repeat the query. Continue this process until no new records are found or if takes too many steps. This should terminate within one step for the absolute majority of queries and at the same time would allow us to reasonably handle edge cases at the cost of some hit to performance for such traces.
