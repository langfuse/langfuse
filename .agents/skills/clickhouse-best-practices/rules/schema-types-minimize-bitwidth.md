---
title: Minimize Bit-Width for Numeric Types
impact: HIGH
impactDescription: "Smaller types reduce storage and improve cache efficiency"
tags: [schema, data-types, numeric, storage]
---

## Minimize Bit-Width for Numeric Types

**Impact: HIGH**

Select the smallest numeric type that accommodates your data range. Prefer unsigned types when negative values aren't needed.

**Incorrect (oversized types):**

```sql
CREATE TABLE metrics (
    status_code Int64,        -- HTTP codes are 100-599
    age Int64,                -- Human age fits in UInt8
    year Int64,               -- Years fit in UInt16
    item_count Int64          -- Often small numbers
)
```

**Correct (right-sized types):**

```sql
CREATE TABLE metrics (
    status_code UInt16,       -- 0-65,535 (HTTP codes fit easily)
    age UInt8,                -- 0-255 (sufficient for age)
    year UInt16,              -- 0-65,535 (sufficient for years)
    item_count UInt32         -- 0-4 billion (adjust based on actual max)
)
```

**Numeric Type Reference:**

| Type | Range | Bytes |
|------|-------|-------|
| UInt8 | 0 to 255 | 1 |
| UInt16 | 0 to 65,535 | 2 |
| UInt32 | 0 to 4.3 billion | 4 |
| UInt64 | 0 to 18 quintillion | 8 |
| Int8 | -128 to 127 | 1 |
| Int16 | -32,768 to 32,767 | 2 |
| Int32 | -2.1 billion to 2.1 billion | 4 |
| Int64 | -9 quintillion to 9 quintillion | 8 |

Reference: [Select Data Types](https://clickhouse.com/docs/best-practices/select-data-types)
