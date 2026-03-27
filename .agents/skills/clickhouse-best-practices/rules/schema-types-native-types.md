---
title: Use Native Types Instead of String
impact: CRITICAL
impactDescription: "2-10x storage reduction; enables compression and correct semantics"
tags: [schema, data-types, storage]
---

## Use Native Types Instead of String

**Impact: CRITICAL**

Using String for all data wastes storage, prevents compression optimization, and makes comparisons slower. ClickHouse's column-oriented architecture benefits directly from optimal type selection.

**Incorrect (String for everything):**

```sql
CREATE TABLE events (
    event_id String,        -- "550e8400-e29b-41d4-a716-446655440000" = 36 bytes
    user_id String,         -- "12345" = 5 bytes (no numeric operations)
    created_at String,      -- "2024-01-15 10:30:00" = 19 bytes
    count String,           -- "42" - can't do math!
    is_active String        -- "true" = 4 bytes
)
```

**Correct (native types):**

```sql
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),     -- 16 bytes (vs 36)
    user_id UInt64,                              -- 8 bytes, numeric ops
    created_at DateTime DEFAULT now(),           -- 4 bytes (vs 19)
    count UInt32 DEFAULT 0,                      -- 4 bytes, math works
    is_active Bool DEFAULT true                  -- 1 byte (vs 4)
)
```

**Type Selection Quick Reference:**

| Data | Use | Avoid |
|------|-----|-------|
| Sequential IDs | UInt32/UInt64 | String |
| UUIDs | UUID | String |
| Status/Category | Enum8 or LowCardinality(String) | String |
| Timestamps | DateTime | DateTime64, String |
| Dates only | Date or Date32 | DateTime, String |
| Counts | UInt8/16/32 (smallest that fits) | Int64, String |
| Money | Decimal(P,S) or Int64 (cents) | Float64, String |
| Booleans | Bool or UInt8 | String |

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)
