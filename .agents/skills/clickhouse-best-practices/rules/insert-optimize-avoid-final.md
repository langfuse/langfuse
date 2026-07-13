---
title: Avoid OPTIMIZE TABLE FINAL
impact: HIGH
impactDescription: "Forces expensive merge of all parts; let background merges work"
tags: [insert, OPTIMIZE, merge, performance]
---

## Avoid OPTIMIZE TABLE FINAL

**Impact: HIGH**

`OPTIMIZE TABLE ... FINAL` forces immediate merge of all parts into one part per partition. This is resource-intensive and rarely necessary. ClickHouse already performs smart background merges.

**Note:** `OPTIMIZE FINAL` is not the same as `FINAL`. The `FINAL` modifier in SELECT queries may be necessary for deduplicated results in ReplacingMergeTree and is generally fine to use.

**Incorrect (OPTIMIZE FINAL after inserts):**

```sql
-- Running OPTIMIZE FINAL after every batch insert
INSERT INTO events SELECT * FROM staging_events;
OPTIMIZE TABLE events FINAL;  -- Expensive and unnecessary!

-- Scheduled OPTIMIZE FINAL jobs
-- Cron: 0 * * * * clickhouse-client -q "OPTIMIZE TABLE events FINAL"
```

**Correct (let background merges work):**

```sql
-- Let background merges handle optimization
INSERT INTO events SELECT * FROM staging_events;
-- Done! ClickHouse merges automatically

-- For ReplacingMergeTree deduplication, use FINAL in queries
SELECT * FROM events FINAL WHERE user_id = 123;
-- Instead of running OPTIMIZE FINAL to deduplicate
```

**Problems with OPTIMIZE FINAL:**
- Rewrites entire partition regardless of need
- Ignores the ~150 GB part size safeguard
- Can cause memory pressure or OOM errors
- Lengthy execution time for large datasets

**When OPTIMIZE FINAL may be acceptable:**
- Finalizing data before table freezing
- Preparing data for export operations
- One-time operations, not regular workflows

**Better alternatives:**

| Need | Alternative |
|------|-------------|
| Deduplicate ReplacingMergeTree | Use `FINAL` modifier in SELECT |
| Reduce part count | Rely on background merges |

Reference: [Avoid OPTIMIZE FINAL](https://clickhouse.com/docs/best-practices/avoid-optimize-final)
