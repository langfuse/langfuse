---
title: Consider Starting Without Partitioning
impact: MEDIUM
impactDescription: "Add partitioning later when you have clear lifecycle requirements"
tags: [schema, partitioning, simplicity]
---

## Consider Starting Without Partitioning

**Impact: MEDIUM**

Start without partitioning and add it later only if:
- You have clear data lifecycle requirements (retention, archiving)
- Your access patterns clearly benefit from partition pruning
- You understand the cardinality implications

**Example (start simple):**

```sql
-- Start simple, no partitioning
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String),
    user_id UInt64
)
ENGINE = MergeTree()
ORDER BY (event_type, timestamp);

-- Add partitioning later if needed for lifecycle management
-- (requires table recreation or materialized view migration)
```

**When to add partitioning:**

| Need | Add Partitioning? |
|------|-------------------|
| Time-based data retention | Yes |
| Archive old data to cold storage | Yes |
| Query performance on time ranges | Maybe (test first) |
| No specific lifecycle needs | No |

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)
