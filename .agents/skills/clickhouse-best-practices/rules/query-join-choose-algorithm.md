---
title: Choose the Right JOIN Algorithm
impact: CRITICAL
impactDescription: "Wrong algorithm causes OOM; right algorithm handles large tables efficiently"
tags: [query, JOIN, algorithm, memory]
---

## Choose the Right JOIN Algorithm

**Impact: CRITICAL**

ClickHouse's default hash join loads the RIGHT table entirely into memory. Choose the right algorithm based on table sizes and constraints.

**Algorithm selection:**

| Algorithm | Best For | Trade-off |
|-----------|----------|-----------|
| `parallel_hash` | Small-to-medium in-memory tables | Default since 24.11; fast, concurrent |
| `hash` | General purpose, all join types | Single-threaded hash table build |
| `direct` | Dictionary lookups (INNER/LEFT only) | Fastest; no hash table construction |
| `full_sorting_merge` | Tables already sorted on join key | Skips sort if pre-ordered; low memory |
| `partial_merge` | Large tables, memory-constrained | Minimized memory; slower execution |
| `grace_hash` | Large datasets, tunable memory | Flexible; disk-spilling capability |
| `auto` | Adaptive algorithm selection | Tries hash first, falls back on memory pressure |

**Example usage:**

```sql
-- Let ClickHouse choose automatically
SET join_algorithm = 'auto';

-- For large-to-large joins where memory is constrained
SET join_algorithm = 'partial_merge';
SELECT * FROM large_a JOIN large_b ON large_b.id = large_a.id;

-- When joining by primary key columns, sort-merge skips sorting step
SET join_algorithm = 'full_sorting_merge';
SELECT * FROM table_a a JOIN table_b b ON b.pk_col = a.pk_col;
```

**Note:** ClickHouse 24.12+ automatically positions smaller tables on the right side. For earlier versions, manually ensure the smaller table is on the RIGHT.

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)
