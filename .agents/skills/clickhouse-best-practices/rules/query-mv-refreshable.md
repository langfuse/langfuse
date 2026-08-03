---
title: Use Refreshable MVs for Complex Joins and Batch Workflows
impact: HIGH
impactDescription: "Sub-millisecond queries with periodic refresh; ideal for complex joins"
tags: [query, materialized-view, refresh, batch]
---

## Use Refreshable MVs for Complex Joins and Batch Workflows

**Impact: HIGH**

Refreshable MVs execute queries periodically on a schedule. The full query re-executes and overwrites (or appends to) the target table.

**Best for:**
- Sub-millisecond latency where minor staleness is acceptable
- Caching "top N" results or lookup tables
- Complex multi-table joins requiring denormalization
- Batch workflows and DAG dependencies

**Incorrect (expensive join on every request):**

```sql
-- Complex join executed on every request
SELECT
    o.order_id, o.total,
    c.name as customer_name,
    p.name as product_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at >= now() - INTERVAL 1 DAY;
```

**Correct (refreshable MV):**

```sql
-- Create refreshable MV that runs every 5 minutes
CREATE MATERIALIZED VIEW orders_denormalized
REFRESH EVERY 5 MINUTE
ENGINE = MergeTree()
ORDER BY (created_at, order_id)
AS SELECT
    o.order_id, o.created_at, o.total,
    c.name as customer_name, c.segment,
    p.name as product_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at >= now() - INTERVAL 1 DAY;

-- Query the pre-joined data (sub-millisecond)
SELECT * FROM orders_denormalized WHERE segment = 'enterprise';
```

**APPEND vs REPLACE modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `REPLACE` (default) | Overwrites previous contents | Current state, lookup tables |
| `APPEND` | Adds new rows to existing data | Periodic snapshots, historical accumulation |

**Critical warning:** Query should run quickly compared to refresh interval. Don't schedule every 10 seconds if the query takes 10+ seconds.

Reference: [Use Materialized Views](https://clickhouse.com/docs/best-practices/use-materialized-views)
