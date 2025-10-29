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
| `rollups` | `Array<RollupConfig>` | Array of rollup configurations. Each rollup creates a CTE that aggregates measures by dimensions, then joins back to enrich observation rows. Column naming convention: `{dimension1}_{dimension2}_{measure}_{aggregation}` or use explicit `alias`. Example: `[{"measures": [{"measure": "totalCost", "aggregation": "sum"}], "dimensions": ["traceId"]}]` will add a `traceId_totalCost_sum` column. When `rollups` is present both `fromStartTime` and `toStartTime` parameters are required. |
| `rawFilters`  | `FilterState` | Raw filter expression (same as on metrics endpoint). Allows more expressive filtering and access to more fields (e.g. metadata) but is more complicated to use. Raw filters may reference rollup columns using the naming convention: `{dimensions}_{measure}_{aggregation}`. E.g. `traceId_totalCost_sum > 0.5` to filter by trace-level total cost. If any of the top level filters are specified, they will override a corresponding clause of the raw filter expression |
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

# Implementation Design: Declarative Query Builder

## Overview

This design introduces a high-level query builder that abstracts away SQL construction complexity. The core insight:
developers should declare **what data they need** (fields, measures, filters, groupings) and the builder automatically.

1. **Detects cross-table dependencies** - When fields like `traceName`, `latency` or `tags` require trace-level data
2. **Generates necessary CTEs** - Automatically creates trace aggregations (via `eventsTracesAggregation`) and measure CTEs
3. **Uses consistent multi-CTE strategy** - When measures are present, always use separate CTEs per measures with the same grouping key, joined at the end
4. **Optimizes query execution** - Pushes filters to appropriate CTE levels

**Note on Traces**: We use `eventsTracesAggregation` to rebuild trace-level data from the events table, not the `traces FINAL` table.
This approach is more performant and aligns with our move away from the separate traces table.

## Core Concept: Fields vs Measures

The field catalog distinguishes only two types:

### Fields
Data that can be directly selected from tables. Can appear in:
- Row-level queries (`SELECT field FROM ...`)
- GROUP BY clauses in aggregations
- WHERE clauses as filters

**Examples**: `id`, `traceId`, `userId`, `name`, `input`, `startTime`, `type`, `traceName`

**Key property**: Source location matters. Fields may come from:
- Events table directly (`e.span_id`, `e.name`)
- Traces (via `eventsTracesAggregation` CTE: `t.name`, `t.tags`)
- Scores table via JOIN (`s.value`, `s.name`)

### Measures
Quantitative data requiring aggregation functions. Cannot be selected directly - must be aggregated with functions like `sum()`, `avg()`, `p95()`.

**Examples**: `totalCost`, `latency`, `count`, `totalTokens`

**Key property**: Each measure defines:
1. **Allowed aggregations** (based on measure type - integer, decimal, etc.)
2. **Supported groupings** (which fields it can be grouped by)

## Field Catalog Schema

```typescript
import { z } from 'zod/v4';

// Reuse existing aggregation types
export const metricAggregations = z.enum([
  'sum', 'avg', 'count', 'min', 'max',
  'p50', 'p75', 'p90', 'p95', 'p99'
]);

type AggregationFunction = z.infer<typeof metricAggregations>;
type MeasureType = 'integer' | 'decimal' | 'string' | 'boolean';

/**
 * Defines where a field/measure comes from and how to access it
 */
type FieldSource =
  | { table: 'events'; sql: string }
  | { table: 'traces'; sql: string; via: 'trace_id' }
  | { table: 'scores'; sql: string; via: 'observation_id' | 'trace_id' };

/**
 * Field - can be selected directly or used in GROUP BY
 */
type FieldDef = {
  kind: 'field';
  source: FieldSource;
  alias: string;
  type: 'string' | 'integer' | 'datetime' | 'json' | 'boolean' | 'array';
  groupable?: boolean;  // Can this field be used in GROUP BY? Default: true for most fields
};

/**
 * Measure - requires aggregation function
 */
type MeasureDef = {
  kind: 'measure';
  source: FieldSource;
  alias: string;
  type: MeasureType;
  allowedAggregations: AggregationFunction[];

  /**
   * Which fields this measure can be grouped by:
   * - ['*']: Can be grouped by any field
   * - ['traceId', 'userId']: Only these specific fields
   * - []: Global aggregation only (no GROUP BY)
   */
  supportedGroupings: string[] | ['*'];

  unit?: string;
};

type CatalogEntry = FieldDef | MeasureDef;
type FieldCatalog = Record<string, CatalogEntry>;
```

## Example Field Catalog: Events Table

```typescript
export const EVENTS_FIELD_CATALOG: FieldCatalog = {
  // ========== EVENTS TABLE FIELDS ==========

  id: {
    kind: 'field',
    source: { table: 'events', sql: 'e.span_id' },
    alias: 'id',
    type: 'string',
    groupable: false,
  },

  traceId: {
    kind: 'field',
    source: { table: 'events', sql: 'e.trace_id' },
    alias: 'trace_id',
    type: 'string',
    groupable: true,
  },

  name: {
    kind: 'field',
    source: { table: 'events', sql: 'e.name' },
    alias: 'name',
    type: 'string',
    groupable: true,
  },

  type: {
    kind: 'field',
    source: { table: 'events', sql: 'e.type' },
    alias: 'type',
    type: 'string',
    groupable: true,
  },

  startTime: {
    kind: 'field',
    source: { table: 'events', sql: 'e.start_time' },
    alias: 'start_time',
    type: 'datetime',
    groupable: false,
  },

  endTime: {
    kind: 'field',
    source: { table: 'events', sql: 'e.end_time' },
    alias: 'end_time',
    type: 'datetime',
    groupable: false,
  },

  input: {
    kind: 'field',
    source: { table: 'events', sql: 'e.input' },
    alias: 'input',
    type: 'json',
    groupable: false,
  },

  output: {
    kind: 'field',
    source: { table: 'events', sql: 'e.output' },
    alias: 'output',
    type: 'json',
    groupable: false,
  },

  metadata: {
    kind: 'field',
    source: { table: 'events', sql: 'e.metadata' },
    alias: 'metadata',
    type: 'json',
    groupable: false,
  },

  environment: {
    kind: 'field',
    source: { table: 'events', sql: 'e.environment' },
    alias: 'environment',
    type: 'string',
    groupable: true,
  },

  version: {
    kind: 'field',
    source: { table: 'events', sql: 'e.version' },
    alias: 'version',
    type: 'string',
    groupable: true,
  },

  level: {
    kind: 'field',
    source: { table: 'events', sql: 'e.level' },
    alias: 'level',
    type: 'string',
    groupable: true,
  },

  promptId: {
    kind: 'field',
    source: { table: 'events', sql: 'e.prompt_id' },
    alias: 'prompt_id',
    type: 'string',
    groupable: true,
  },

  providedModelName: {
    kind: 'field',
    source: { table: 'events', sql: 'e.provided_model_name' },
    alias: 'provided_model_name',
    type: 'string',
    groupable: true,
  },

  // ========== CROSS-TABLE FIELDS (FROM TRACES VIA eventsTracesAggregation) ==========

  tags: {
    kind: 'field',
    source: {
      table: 'traces',
      sql: 'groupArray(e.tags)',
      via: 'trace_id'
    },
    alias: 'tags',
    type: 'array',
    groupable: false,
  },

  traceName: {
    kind: 'field',
    source: {
      table: 'traces',
      sql: "argMaxIf(e.name, e.event_ts, e.parent_span_id = '')",
      via: 'trace_id'
    },
    alias: 'traceName',
    type: 'string',
    groupable: true,
  },

  // ========== MEASURES ==========

  count: {
    kind: 'measure',
    source: { table: 'events', sql: '*' },
    alias: 'count',
    type: 'integer',
    allowedAggregations: ['count'],
    supportedGroupings: ['*'],
    description: 'Count of observations',
    unit: 'observations',
  },

  totalCost: {
    kind: 'measure',
    source: { table: 'events', sql: 'e.total_cost' },
    alias: 'total_cost',
    type: 'decimal',
    allowedAggregations: ['sum', 'avg', 'min', 'max', 'p50', 'p95', 'p99'],
    supportedGroupings: ['*'],
    unit: 'USD',
  },

  latency: {
    kind: 'measure',
    source: {
      table: 'events',
      sql: "date_diff('millisecond', min(e.start_time), max(e.end_time))"
    },
    alias: 'latency',
    type: 'integer',
    allowedAggregations: ['avg', 'min', 'max', 'p50', 'p75', 'p90', 'p95', 'p99'],
    supportedGroupings: ['*'],
    unit: 'milliseconds',
  },

  totalTokens: {
    kind: 'measure',
    source: { table: 'events', sql: "e.usage_details['total']" },
    alias: 'total_tokens',
    type: 'integer',
    allowedAggregations: ['sum', 'avg', 'max'],
    supportedGroupings: ['*'],
    unit: 'tokens',
  },

  // Example: Trace-level measure (constrained grouping)
  traceCost: {
    kind: 'measure',
    source: { table: 'events', sql: 'e.total_cost' },
    alias: 'trace_total_cost',
    type: 'decimal',
    allowedAggregations: ['sum'],
    supportedGroupings: ['traceId'],  // MUST be grouped by trace
    description: 'Total cost aggregated at trace level',
    unit: 'USD',
  },
};
```

## High-Level API

The builder should have a minimal, declarative surface following public API patterns:

```typescript
interface ApiQueryBuilder {
  // Row-level queries (no aggregation)
  select(fields: string[]): QueryBuilder;

  // Aggregation queries (returns aggregated rows)
  aggregate(config: {
    measures: Array<{ measure: string; aggregation: AggregationFunction }>;
    dimensions: string[];  // fields to group by
  }): QueryBuilder;

  // Rollups - enrich observation rows with aggregation context
  // Each call creates a CTE and joins back to observations
  // Chainable: .withRollup(...).withRollup(...)
  withRollup(rollup: {
    measures: Array<{
      measure: string;
      aggregation: AggregationFunction;
      alias?: string;  // Optional explicit alias, defaults to {dimensions}_{measure}_{aggregation}
    }>;
    dimensions: string[];
  }): QueryBuilder;

  // Filtering (can reference rollup fields in filters)
  where(filters: FilterExpression): QueryBuilder;

  // Sorting and pagination
  orderBy(field: string, direction: 'asc' | 'desc'): QueryBuilder;
  limit(n: number): QueryBuilder;
  offset(n: number): QueryBuilder;

  // Cursor-based pagination
  cursor(encodedCursor: string): QueryBuilder;

  // Execution
  execute(): Promise<Row[]>;
  executeStream(): AsyncGenerator<Row>;
}
```

## Request Flow Examples

### Example 1: Simple Row Query

**HTTP Request:**
```json
POST /api/public/v2/observations
{
  "fields": ["id", "traceId", "name", "startTime", "type"],
  "fromStartTime": "2025-01-01T00:00:00Z",
  "toStartTime": "2025-01-02T00:00:00Z",
  "limit": 50
}
```

**Builder Calls:**
```typescript
const query = builder
  .select(['id', 'traceId', 'name', 'startTime', 'type'])
  .where({
    and: [
      { field: 'startTime', op: '>=', value: '2025-01-01T00:00:00Z' },
      { field: 'startTime', op: '<', value: '2025-01-02T00:00:00Z' }
    ]
  })
  .orderBy('startTime', 'desc')
  .limit(50);
```

**Generated SQL:**
```sql
SELECT
  e.span_id as id,
  e.trace_id,
  e.name,
  e.start_time,
  e.type
FROM events e
WHERE e.project_id = {projectId: String}
  AND e.start_time >= {fromStartTime: DateTime64(3)}
  AND e.start_time < {toStartTime: DateTime64(3)}
ORDER BY e.start_time DESC
LIMIT 50
```

### Example 2: Query with Trace-Level Fields

**HTTP Request:**
```json
{
  "fields": ["id", "traceId", "traceName", "tags", "startTime"],
  "limit": 50
}
```

**Builder Calls:**
```typescript
const query = builder
  .select(['id', 'traceId', 'traceName', 'tags', 'startTime'])
  .orderBy('startTime', 'desc')
  .limit(50);
```

**Builder Logic:**
1. Detects `traceName` and `tags` require traces CTE (cross-table fields)
2. Automatically generates `eventsTracesAggregation` CTE
3. Joins events with traces CTE

**Generated SQL:**
```sql
WITH traces AS (
  SELECT
    e.trace_id,
    argMaxIf(e.name, e.event_ts, e.parent_span_id = '') as name,
    groupArray(e.tags) as tags
  FROM events e
  WHERE e.project_id = {projectId: String}
  GROUP BY e.trace_id
)
SELECT
  e.span_id as id,
  e.trace_id,
  t.name as traceName,
  t.tags,
  e.start_time
FROM events e
LEFT JOIN traces t ON e.trace_id = t.trace_id
WHERE e.project_id = {projectId: String}
ORDER BY e.start_time DESC
LIMIT 50
```

### Example 3: Aggregation with Measures

**HTTP Request:**
```json
{
  "measures": [
    { "measure": "totalCost", "aggregation": "sum" },
    { "measure": "count", "aggregation": "count" }
  ],
  "dimensions": ["traceId", "name"],
  "fromStartTime": "2025-01-01T00:00:00Z",
  "toStartTime": "2025-01-02T00:00:00Z",
  "limit": 100
}
```

**Builder Calls:**
```typescript
const query = builder
  .aggregate({
    measures: [
      { measure: 'totalCost', aggregation: 'sum' },
      { measure: 'count', aggregation: 'count' }
    ],
    dimensions: ['traceId', 'name']
  })
  .where({ /* time filters */ })
  .limit(100);
```

**Generated SQL (Single CTE for Shared Grouping):**
```sql
-- All measures with same grouping key in one CTE
WITH measures_cte AS (
  SELECT
    e.trace_id,
    e.name,
    sum(e.total_cost) as total_cost_sum,
    count(*) as count
  FROM events e
  WHERE e.project_id = {projectId: String}
    AND e.start_time >= {fromStartTime: DateTime64(3)}
    AND e.start_time < {toStartTime: DateTime64(3)}
  GROUP BY e.trace_id, e.name
)
SELECT
  trace_id,
  name,
  total_cost_sum,
  count
FROM measures_cte
ORDER BY total_cost_sum DESC
LIMIT 100
```

### Example 3b: Multiple CTEs for Different Grouping Keys

**HTTP Request:**
```json
{
  "fields": ["id", "traceId", "environment", "totalCost"],
  "rollups": [
    {
      "measures": [{ "measure": "totalCost", "aggregation": "sum" }],
      "dimensions": ["traceId"]
    },
    {
      "measures": [{ "measure": "count", "aggregation": "count" }],
      "dimensions": ["environment"]
    }
  ],
  "limit": 100
}
```

**Builder Calls:**
```typescript
// HTTP rollups array maps to chained .withRollup() calls
const query = builder
  .select(['id', 'traceId', 'environment', 'totalCost'])
  .withRollup({
    measures: [{ measure: 'totalCost', aggregation: 'sum' }],
    dimensions: ['traceId']
  })
  .withRollup({
    measures: [{ measure: 'count', aggregation: 'count' }],
    dimensions: ['environment']
  })
  .limit(100);
```

**Builder Logic:**
Detects two completely different grouping keys (`traceId` vs `environment`), creates separate CTEs, then enriches observation rows with both rollup contexts via separate joins.

**Generated SQL (Multiple CTEs for Different Groupings):**
```sql
-- Trace-level rollup
WITH trace_rollup AS (
  SELECT
    e.trace_id,
    sum(e.total_cost) as traceId_totalCost_sum
  FROM events e
  WHERE e.project_id = {projectId: String}
  GROUP BY e.trace_id
),
-- Environment-level rollup
environment_rollup AS (
  SELECT
    e.environment,
    count(*) as environment_count_count
  FROM events e
  WHERE e.project_id = {projectId: String}
  GROUP BY e.environment
)
-- Join both rollups back to observation rows
SELECT
  e.span_id as id,
  e.trace_id,
  e.environment,
  e.total_cost,
  t.traceId_totalCost_sum,           -- Systematic naming: dimension_measure_aggregation
  env.environment_count_count         -- Systematic naming: dimension_measure_aggregation
FROM events e
LEFT JOIN trace_rollup t ON e.trace_id = t.trace_id
LEFT JOIN environment_rollup env ON e.environment = env.environment
WHERE e.project_id = {projectId: String}
ORDER BY e.start_time DESC
LIMIT 100
```

**Note**: This pattern is useful when you want observation-level rows enriched with multiple aggregation contexts at different granularities. Each rollup requires its own CTE because they group by fundamentally different dimensions.

### Example 4: Rollups with Filtering (Advanced)

**HTTP Request:**
```json
{
  "fields": ["id", "traceId", "startTime", "totalCost"],
  "rollups": [
    {
      "measures": [{ "measure": "totalCost", "aggregation": "sum" }],
      "dimensions": ["traceId"]
    }
  ],
  "rawFilters": {
    "and": [
      { "field": "traceId_totalCost_sum", "op": ">", "value": 0.5 }
    ]
  },
  "limit": 50
}
```

**Builder Calls:**
```typescript
const query = builder
  .select(['id', 'traceId', 'startTime', 'totalCost'])
  .withRollup({
    measures: [{ measure: 'totalCost', aggregation: 'sum' }],
    dimensions: ['traceId']
  })
  .where({
    and: [
      { field: 'traceId_totalCost_sum', op: '>', value: 0.5 }  // Filter on rollup column
    ]
  })
  .orderBy('startTime', 'desc')
  .limit(50);
```

**Builder Logic:**
1. Computes rollup (trace-level totalCost sum)
2. Filters observations where their trace matches rollup criteria
3. Returns observation-level rows with rollup context

**Generated SQL:**
```sql
WITH rollup AS (
  SELECT
    e.trace_id,
    sum(e.total_cost) as traceId_totalCost_sum
  FROM events e
  WHERE e.project_id = {projectId: String}
    AND e.start_time >= {fromStartTime: DateTime64(3)}
    AND e.start_time < {toStartTime: DateTime64(3)}
  GROUP BY e.trace_id
  HAVING traceId_totalCost_sum > 0.5
  ORDER BY traceId_totalCost_sum DESC
  LIMIT 10000  -- safety limit on rollup
)
SELECT
  e.span_id as id,
  e.trace_id,
  e.start_time,
  e.total_cost,
  r.traceId_totalCost_sum  -- Systematic naming: dimension_measure_aggregation
FROM events e
INNER JOIN rollup r ON e.trace_id = r.trace_id
WHERE e.project_id = {projectId: String}
ORDER BY r.traceId_totalCost_sum DESC, e.start_time DESC
LIMIT 50
```

### Example 5: Rollup with Explicit Alias

**HTTP Request:**
```json
{
  "fields": ["id", "traceId", "startTime"],
  "rollups": [
    {
      "measures": [{ "measure": "totalCost", "aggregation": "sum", "alias": "traceCost" }],
      "dimensions": ["traceId"]
    }
  ],
  "limit": 50
}
```

**Builder Calls:**
```typescript
const query = builder
  .select(['id', 'traceId', 'startTime'])
  .withRollup({
    measures: [{ measure: 'totalCost', aggregation: 'sum', alias: 'traceCost' }],
    dimensions: ['traceId']
  })
  .limit(50);
```

**Generated SQL:**
```sql
WITH rollup AS (
  SELECT
    e.trace_id,
    sum(e.total_cost) as traceCost  -- Uses explicit alias
  FROM events e
  WHERE e.project_id = {projectId: String}
  GROUP BY e.trace_id
)
SELECT
  e.span_id as id,
  e.trace_id,
  e.start_time,
  r.traceCost  -- Reference by alias
FROM events e
LEFT JOIN rollup r ON e.trace_id = r.trace_id
WHERE e.project_id = {projectId: String}
ORDER BY e.start_time DESC
LIMIT 50
```

## Rollup Column Naming Convention

**Default naming**: `{dimension1}_{dimension2}_{...}_{measure}_{aggregation}`

**Examples:**
- `dimensions: ['traceId']`, `measure: 'totalCost'`, `aggregation: 'sum'` → `traceId_totalCost_sum`
- `dimensions: ['environment']`, `measure: 'count'`, `aggregation: 'count'` → `environment_count_count`
- `dimensions: ['traceId', 'name']`, `measure: 'latency'`, `aggregation: 'p95'` → `traceId_name_latency_p95`

**Explicit aliases**: Use the `alias` field to override the default naming:
```json
{
  "measures": [
    { "measure": "totalCost", "aggregation": "sum", "alias": "traceTotalCost" }
  ]
}
```

**Why systematic naming?**
- Predictable: Users know exactly what column name to reference in filters
- Collision-free: Multiple rollups won't conflict
- Self-documenting: Column name describes the aggregation

## Query Builder Execution Flow

```
1. Parse HTTP Request
   ↓
2. Validate Against Field Catalog
   - Check field existence
   - Verify measure aggregations
   - Validate grouping compatibility
   ↓
3. Analyze Dependencies
   - Detect cross-table fields (traces, scores)
   - Identify required CTEs
   - Determine join strategy
   ↓
4. Generate Query Plan
   - Row query: SELECT fields FROM events [+ JOINs]
   - Aggregation: Multiple measure CTEs → JOIN
   - Rollups: Rollup CTE → Filter observations
   ↓
5. Build SQL
   - Generate CTEs (traces, measures, rollups)
   - Construct main SELECT
   - Apply filters at appropriate CTE level
   - Add ORDER BY, LIMIT
   ↓
6. Execute & Stream Results
```

## Builder Implementation Principles

1. **Declarative Configuration**: Developer specifies WHAT, builder determines HOW
2. **Automatic Optimization**: Builder pushes filters to appropriate CTE levels
3. **Type Safety**: Field catalog ensures only valid fields/measures/aggregations
4. **One CTE per Grouping Key**: Measures sharing the same dimensions are computed in a single CTE to minimize data scans. Only create separate CTEs when grouping keys differ (e.g., trace-level vs observation-level aggregations).
5. **Systematic Column Naming**: Rollup columns follow `{dimensions}_{measure}_{aggregation}` convention for predictability, or use explicit aliases for custom naming.
