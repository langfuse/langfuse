---
title: Optimize NULL Handling in Outer JOINs
impact: MEDIUM
impactDescription: "Default values instead of NULL reduces memory overhead"
tags: [query, JOIN, NULL, memory]
---

## Optimize NULL Handling in Outer JOINs

**Impact: MEDIUM**

Set `join_use_nulls = 0` to use default column values instead of NULL markers, reducing memory overhead compared to Nullable wrappers.

**Example:**

```sql
-- Use default values instead of NULLs for non-matching rows
SET join_use_nulls = 0;

SELECT o.order_id, c.name
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id;
-- Non-matching rows get '' for name instead of NULL
```

**When to use:**

| Setting | Behavior | Use Case |
|---------|----------|----------|
| `join_use_nulls = 0` | Default values (empty string, 0) for non-matches | When you can handle default values |
| `join_use_nulls = 1` (default) | NULL for non-matches | When you need to distinguish "no match" from "matched with default" |

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)
