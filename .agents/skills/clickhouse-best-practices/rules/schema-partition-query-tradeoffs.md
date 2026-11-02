---
title: Understand Partition Query Performance Trade-offs
impact: MEDIUM
impactDescription: "Partition pruning helps some queries; spanning many partitions hurts others"
tags: [schema, partitioning, query, performance]
---

## Understand Partition Query Performance Trade-offs

**Impact: MEDIUM**

Partitioning can help or hurt query performance:
- **Potential improvement**: Queries filtering by partition key may benefit from partition pruning
- **Potential degradation**: Queries spanning many partitions increase total parts scanned

ClickHouse automatically builds **MinMax indexes** on partition columns. Data merges occur **within partitions only**, not across them.

**Incorrect (query scans all partitions):**

```sql
-- Query must scan all partitions
SELECT count(*) FROM events
WHERE event_type = 'click';  -- No partition pruning
```

**Correct (query prunes to single partition):**

```sql
-- Query prunes to single partition
SELECT count(*) FROM events
WHERE timestamp >= '2024-01-01' AND timestamp < '2024-02-01'
  AND event_type = 'click';
```

Reference: [Choosing a Partitioning Key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)
