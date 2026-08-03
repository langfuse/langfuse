---
title: Use Data Skipping Indices for Non-ORDER BY Filters
impact: HIGH
impactDescription: "Up to 60x faster queries by skipping irrelevant granules"
tags: [query, index, skipping, bloom_filter]
---

## Use Data Skipping Indices for Non-ORDER BY Filters

**Impact: HIGH**

Queries filtering on columns not in ORDER BY cannot use the primary index and result in full scans. Data skipping indices store metadata about blocks and skip granules that definitely don't match.

**Important:** Skip indices should be considered **after** optimizing data types, primary key selection, and materialized views.

**When to use:**
- High overall cardinality but low cardinality within blocks
- Rare values critical for search (error codes, specific IDs)
- Column correlates with primary key

**When NOT to use:**
- As a first optimization step
- Matching values scattered across many blocks
- Without testing on real data

**Incorrect (filtering on non-ORDER BY column):**

```sql
CREATE TABLE events (
    event_type LowCardinality(String),
    timestamp DateTime,
    user_id UInt64    -- Not in ORDER BY
)
ENGINE = MergeTree()
ORDER BY (event_type, toDate(timestamp));

-- Query filters on user_id - scans all matching event_type
SELECT * FROM events
WHERE event_type = 'click' AND user_id = 12345;
```

**Correct (add skipping index):**

```sql
CREATE TABLE events (
    event_type LowCardinality(String),
    timestamp DateTime,
    user_id UInt64,
    INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 4
)
ENGINE = MergeTree()
ORDER BY (event_type, toDate(timestamp));

-- Or add to existing table
ALTER TABLE events ADD INDEX idx_user_id user_id TYPE bloom_filter GRANULARITY 4;
ALTER TABLE events MATERIALIZE INDEX idx_user_id;
```

**Index types:**

| Type | Best For | Example Filter |
|------|----------|----------------|
| `bloom_filter` | Equality on high-cardinality | `WHERE user_id = 123` |
| `set(N)` | Low cardinality (N unique values) | `WHERE status IN ('a','b')` |
| `minmax` | Range queries | `WHERE amount > 1000` |
| `ngrambf_v1` | Text search | `WHERE text LIKE '%term%'` |
| `tokenbf_v1` | Token search | `WHERE hasToken(text, 'word')` |

**Validation:**

```sql
EXPLAIN indexes = 1
SELECT * FROM events WHERE user_id = 12345;
-- Look for "Skip" in output showing granules skipped
```

Reference: [Use Data Skipping Indices Where Appropriate](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate)
