# Langfuse Cloud Cost Marts

Use this reference when querying or explaining Langfuse Cloud cost structure.

Dashboard:

- https://langfuse.metabaseapp.com/dashboard/22-infra-cost?account=&date=past90days&tab=20-tab-1

## Primary Tables

| Purpose | Table | ID |
| --- | --- | --- |
| Unified AWS and ClickHouse cost rows by provider, service, usage type, account, and day | `langfuse_prod.mart_daily_cost_chart` | `739` |
| Daily headline totals plus tracing event counts and cost per 100k events | `langfuse_prod.mart_daily_cost_with_events` | `784` |
| Detailed AWS CUR summary by product, operation, account, and usage type | `langfuse_prod.mart_aws_cost_daily_by_service` | `610` |
| Detailed ClickHouse costs by entity and metric | `langfuse_prod.mart_clickhouse_daily_cost` | `689` |

Prefer table `739` for structural breakdowns. Prefer table `784` for daily
headline totals.

## Field IDs

### `mart_daily_cost_chart` (`739`)

| Field ID | Field |
| --- | --- |
| `t739-0` | `usage_date` |
| `t739-1` | `service_provider` |
| `t739-2` | `service_name` |
| `t739-3` | `operation` |
| `t739-4` | `usage_type` |
| `t739-5` | `account_name` |
| `t739-6` | `cost_usd` |

### `mart_daily_cost_with_events` (`784`)

| Field ID | Field |
| --- | --- |
| `t784-0` | `usage_date` |
| `t784-1` | `total_cost_usd` |
| `t784-2` | `clickhouse_cost_usd` |
| `t784-3` | `aws_cost_usd` |
| `t784-5` | `s3_api_operations_cost_usd` |
| `t784-6` | `total_tracing_events` |
| `t784-7` | `total_cost_per_100k_events` |

## Metabase MCP Patterns

The Metabase MCP supports `query` for direct reads and
`construct_query` plus `execute_query` for reusable opaque queries. In practice,
pass `filters`, `aggregations`, `group_by`, and `fields` as JSON arrays:

```json
{
  "table_id": 739,
  "filters": [
    {
      "field_id": "t739-0",
      "operation": "greater-than-or-equal",
      "value": "2026-05-09"
    }
  ],
  "aggregations": [
    {
      "function": "sum",
      "field_id": "t739-6"
    }
  ],
  "group_by": [
    { "field_id": "t739-1" },
    { "field_id": "t739-2" }
  ],
  "limit": "200"
}
```

If a tool surface insists on strings for those parameters, serialize the same
arrays as JSON strings.

## Common Breakdowns

Provider split:

- Table `739`
- Aggregate `sum(t739-6)`
- Group by `t739-1`

Service split:

- Table `739`
- Aggregate `sum(t739-6)`
- Group by `t739-1`, `t739-2`

Usage type split:

- Table `739`
- Aggregate `sum(t739-6)`
- Group by `t739-1`, `t739-4`

Environment/account split:

- Table `739`
- Aggregate `sum(t739-6)`
- Group by `t739-1`, `t739-5`

Daily headline totals:

- Table `784`
- Filter `t784-0` by date.
- Read `total_cost_usd`, `clickhouse_cost_usd`, `aws_cost_usd`,
  `total_tracing_events`, and `total_cost_per_100k_events`.

Daily trend by provider:

- Table `739`
- Aggregate `sum(t739-6)`
- Group by `t739-0`, `t739-1`

Drilldown sequence for a cost spike:

1. Compare total daily cost in table `784`.
2. Split the same days by provider in table `739`.
3. Split the dominant provider by service.
4. Split the dominant service by usage type, operation, and account.

## Caveats

- Current-day AWS cost can be incomplete because AWS CUR data may not have
  landed yet.
- For stable recent analysis, prefer the last complete UTC days rather than
  including today.
- ClickHouse cost rows are labeled `cost_usd` in the unified mart, but the
  source metric is ClickHouse credits. Mention this when precision or billing
  interpretation matters.
- Field IDs can change if Metabase models are rebuilt. If a query fails, search
  Metabase for the table name and inspect the returned metadata before
  changing the analysis.
