---
title: Avoid ALTER TABLE DELETE
impact: CRITICAL
impactDescription: "Use lightweight DELETE, CollapsingMergeTree, or DROP PARTITION instead"
tags: [insert, mutation, DELETE, CollapsingMergeTree]
---

## Avoid ALTER TABLE DELETE

**Impact: CRITICAL**

`ALTER TABLE DELETE` is a mutation that rewrites entire data parts. Use alternatives like lightweight DELETE, CollapsingMergeTree, or DROP PARTITION.

**Incorrect (mutation delete):**

```sql
-- Mutation delete for cleanup
ALTER TABLE orders DELETE WHERE status = 'cancelled';

-- Time-based cleanup via mutation (very expensive)
ALTER TABLE sessions DELETE WHERE created_at < now() - INTERVAL 7 DAY;
```

**Correct - CollapsingMergeTree:**

```sql
CREATE TABLE orders (
    order_id UInt64,
    customer_id UInt64,
    total Decimal(10,2),
    sign Int8  -- 1 = active, -1 = deleted
)
ENGINE = CollapsingMergeTree(sign)
ORDER BY order_id;

-- Insert order
INSERT INTO orders VALUES (123, 456, 99.99, 1);

-- "Delete" by inserting with sign = -1
INSERT INTO orders VALUES (123, 456, 99.99, -1);

-- Query collapses +1 and -1 pairs
SELECT order_id, sum(total * sign) as total
FROM orders GROUP BY order_id HAVING sum(sign) > 0;
```

**Correct - Lightweight Deletes (23.3+):**

```sql
-- Marks rows, doesn't rewrite immediately
DELETE FROM orders WHERE status = 'cancelled';
-- Physical deletion happens during normal merges
```

**Correct - DROP PARTITION for Bulk Deletion:**

```sql
-- Instant deletion of old data
ALTER TABLE events DROP PARTITION '202301';

-- Much faster than:
ALTER TABLE events DELETE WHERE toYYYYMM(timestamp) = 202301;
```

**Delete strategy comparison:**

| Method | Speed | When to Use |
|--------|-------|-------------|
| ALTER DELETE | Slow | Rare corrections only |
| CollapsingMergeTree | Fast | Frequent soft deletes |
| Lightweight DELETE | Medium | Occasional deletes |
| DROP PARTITION | Instant | Bulk deletion by partition |

Reference: [Avoid Mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)
