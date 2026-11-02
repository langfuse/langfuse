---
title: Avoid Nullable Unless Semantically Required
impact: HIGH
impactDescription: "Nullable adds storage overhead; use DEFAULT values instead"
tags: [schema, data-types, Nullable, DEFAULT]
---

## Avoid Nullable Unless Semantically Required

**Impact: HIGH**

Nullable columns maintain a separate UInt8 column for tracking null values, increasing storage and degrading performance. Use DEFAULT values instead when feasible.

**Incorrect (Nullable everywhere):**

```sql
CREATE TABLE users (
    id Nullable(UInt64),              -- IDs should never be null
    name Nullable(String),            -- Empty string is fine
    age Nullable(UInt8),              -- 0 is a valid default
    login_count Nullable(UInt32)      -- 0 is a valid default
)
```

**Correct (DEFAULT values, Nullable only when semantic):**

```sql
CREATE TABLE users (
    id UInt64,                                    -- Never null
    name String DEFAULT '',                       -- Empty = unknown
    age UInt8 DEFAULT 0,                          -- 0 = unknown
    login_count UInt32 DEFAULT 0,                 -- 0 = never logged in
    deleted_at Nullable(DateTime),                -- NULL = not deleted (semantic!)
    parent_id Nullable(UInt64)                    -- NULL = no parent (semantic!)
)
```

**When Nullable IS appropriate:**

| Use Case | Why |
|----------|-----|
| `deleted_at` | NULL = "not deleted", timestamp = "deleted at X" |
| `parent_id` | NULL = "no parent", value = "has parent" |
| `discount_percent` | NULL = "no discount", 0 = "0% discount" |

**Defaults instead of Nullable:**

| Type | Default |
|------|---------|
| String | `''` (empty string) |
| UInt*/Int* | `0` |
| DateTime | `now()` or `toDateTime(0)` |
| UUID | `generateUUIDv4()` |

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)
