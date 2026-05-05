---
title: Order Columns by Cardinality (Low to High)
impact: CRITICAL
impactDescription: "Enables granule skipping; high-cardinality first prevents index pruning"
tags: [schema, primary-key, cardinality, ORDER BY]
---

## Order Columns by Cardinality (Low to High)

**Impact: CRITICAL**

Since the sparse primary index operates on data blocks (granules) rather than individual rows, low-cardinality leading columns create more useful index entries that can skip entire blocks. Place lower-cardinality columns before higher-cardinality ones in the ordering key.

**Incorrect (high cardinality first):**

```sql
-- UUID first means no pruning benefit
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_id, event_type, timestamp);
-- Every granule has different event_id values, index can't skip anything
```

**Correct (low cardinality first):**

```sql
-- Low cardinality first enables pruning
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_type, event_date, event_id);
-- Index can skip entire event_type groups
```

**Column Order Guidelines:**

| Position | Cardinality | Examples |
|----------|-------------|----------|
| 1st | Low (few distinct values) | event_type, status, country |
| 2nd | Date (coarse granularity) | toDate(timestamp) |
| 3rd+ | Medium-High | user_id, session_id |
| Last | High (if needed) | event_id, uuid |

**Tip:** Use `toDate(timestamp)` instead of raw `DateTime` columns when day-level filtering suffices - this reduces index size from 32-bit to 16-bit representations.

Reference: [Choosing a Primary Key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)
