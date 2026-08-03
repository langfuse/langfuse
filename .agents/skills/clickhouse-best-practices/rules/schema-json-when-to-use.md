---
title: Use JSON Type for Dynamic Schemas
impact: MEDIUM
impactDescription: "Field-level querying for semi-structured data; use typed columns for known schemas"
tags: [schema, JSON, semi-structured, flexibility]
---

## Use JSON Type for Dynamic Schemas

**Impact: MEDIUM**

ClickHouse's JSON type splits JSON objects into separate sub-columns, enabling field-level query optimization. Use it for truly dynamic data, not everything.

**Incorrect (schema bloat or opaque String):**

```sql
-- BAD: Hundreds of nullable columns for event properties
CREATE TABLE events (
    event_id UUID,
    prop_page_url Nullable(String),
    prop_button_id Nullable(String),
    -- ... 100 more nullable columns
)

-- BAD: JSON as String when you need field queries
CREATE TABLE events (
    event_id UUID,
    properties String  -- No field-level optimization
)
```

**Correct (JSON for dynamic, typed for known):**

```sql
-- Use JSON type for dynamic properties
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),
    event_type LowCardinality(String),
    timestamp DateTime DEFAULT now(),
    properties JSON  -- Flexible schema with type inference
)
ENGINE = MergeTree()
ORDER BY (event_type, timestamp);

-- Query JSON paths directly
SELECT
    event_type,
    properties.url as page_url,
    properties.amount as purchase_amount
FROM events
WHERE event_type = 'page_view' AND properties.url = '/home';
```

**When to use JSON:**

| Scenario | Use JSON? |
|----------|-----------|
| Data structure varies unpredictably | Yes |
| Field types/schemas change over time | Yes |
| Need field-level querying | Yes |
| Fixed, known schema | No (use typed columns) |
| JSON as opaque blob (no field queries) | No (use String) |

**Optimization: specify types for known paths:**

```sql
CREATE TABLE events (
    properties JSON(
        url String,
        amount Float64,
        product_id UInt64
    )
)
```

Reference: [Use JSON Where Appropriate](https://clickhouse.com/docs/best-practices/use-json-where-appropriate)
