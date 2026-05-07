---
title: Filter Tables Before Joining
impact: CRITICAL
impactDescription: "Joining full tables then filtering wastes resources"
tags: [query, JOIN, filtering, subquery]
---

## Filter Tables Before Joining

**Impact: CRITICAL**

Joining full tables then filtering wastes resources. Add filtering in `WHERE` or `JOIN ON` clauses. If automatic pushdown fails, restructure as a subquery.

**Incorrect (join then filter):**

```sql
-- Joins entire tables, then filters
SELECT o.order_id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01' AND c.country = 'US';
```

**Correct (filter in subqueries before joining):**

```sql
-- Filter in subqueries before joining
SELECT o.order_id, c.name, o.total
FROM (
    SELECT order_id, customer_id, total
    FROM orders
    WHERE created_at > '2024-01-01'
) o
JOIN (
    SELECT id, name
    FROM customers
    WHERE country = 'US'
) c ON c.id = o.customer_id;
```

**Even better - aggregate before joining:**

```sql
SELECT c.country, o.total_revenue
FROM (
    SELECT customer_id, sum(total) as total_revenue
    FROM orders
    WHERE created_at > '2024-01-01'
    GROUP BY customer_id
) o
JOIN customers c ON c.id = o.customer_id;
```

Reference: [Minimize and Optimize JOINs](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)
