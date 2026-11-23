# sql-interface (proof of concept)

Customers write SQL over a virtual `observations` table, and we compile it to
tenant-scoped ClickHouse SQL. The goal is to replace the v2 observations API.

```
customer SQL
  -> lexer.ts      tokens (plain identifiers, '' strings, numbers, no backslashes)
  -> parser.ts     SelectStatement (one SELECT, one table, no joins/subqueries/CTEs/SETTINGS)
  -> translate.ts  query-AST select over `events as e`, customer columns -> physical (schema.ts)
  -> compileClickhouseQuery   tenancy injection, events_core/events_full routing,
                              function allowlist, aggregate type check
  -> execute.ts    queryClickhouse on EventsReadOnly with readonly/time/memory/row caps
```

The endpoint is `POST /api/public/unstable/sql` with the body `{ "query": "…" }`.

```sql
SELECT model, count(*) AS n, quantile(0.95)(latency_ms) AS p95, sum(total_cost)
FROM observations
WHERE start_time >= now() - INTERVAL 7 DAY AND metadata['tier'] = 'pro'
GROUP BY model ORDER BY n DESC LIMIT 10
```

## Guarantees and where they live

- The grammar has no way to name a second relation, so a query can only read
  the one table.
- The customer never sees physical names. Only `schema.ts` columns resolve,
  and output aliases may not reuse a physical column name (`x AS project_id`).
- `project_id` is injected by the query AST and ANDed outside the customer
  `WHERE`.
- Functions pass two allowlists: the customer one in `translate.ts`, then
  the query-AST one in `functions.ts`.
- `LIMIT` defaults to 100 and is capped at 1000. A plan's data-access window
  is applied as a `start_time` floor.

## Open questions for a real version

- Pagination: cursor or keyset, compared with the v2 API cursor.
- Field-group parity with v2 (`fields`, `expandMetadata`), and how `*` should
  expand.
- Per-plan rate limits and cost limits (`max_rows_to_read`, `max_bytes_to_read`).
- Whether we need joins to `traces` or `scores`, which would mean a second
  customer table and join support in the grammar.
- A typed translator that rejects type errors (`name + 1`) before ClickHouse does.
- Fern / OpenAPI docs once the surface is stable.
