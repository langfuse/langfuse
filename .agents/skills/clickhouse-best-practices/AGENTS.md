# ClickHouse Best Practices

**Version 0.1.0**  
ClickHouse Inc  
January 2026
ClickHouse 24.1+

> **Note:**  
> This document is mainly for agents and LLMs to follow when designing,  
> optimizing, or maintaining ClickHouse databases. Humans may also find it  
> useful, but guidance here is optimized for automation and consistency by  
> AI-assisted workflows.

---

## Abstract

Comprehensive best practices for ClickHouse database optimization. Covers schema design, query optimization, table engines, indexing strategies, materialized views, distributed operations, and operational best practices. Each rule includes detailed explanations, SQL examples comparing incorrect vs. correct implementations, and specific impact metrics to guide database design and query optimization.

---

## Table of Contents

1. [Schema Design](#1-schema-design) — **CRITICAL**
   - 1.1 [Avoid Nullable Unless Semantically Required](#11-avoid-nullable-unless-semantically-required)
   - 1.2 [Consider Starting Without Partitioning](#12-consider-starting-without-partitioning)
   - 1.3 [Filter on ORDER BY Columns in Queries](#13-filter-on-order-by-columns-in-queries)
   - 1.4 [Keep Partition Cardinality Low (100-1,000 Values)](#14-keep-partition-cardinality-low-100-1000-values)
   - 1.5 [Minimize Bit-Width for Numeric Types](#15-minimize-bit-width-for-numeric-types)
   - 1.6 [Order Columns by Cardinality (Low to High)](#16-order-columns-by-cardinality-low-to-high)
   - 1.7 [Plan PRIMARY KEY Before Table Creation](#17-plan-primary-key-before-table-creation)
   - 1.8 [Prioritize Filter Columns in ORDER BY](#18-prioritize-filter-columns-in-order-by)
   - 1.9 [Understand Partition Query Performance Trade-offs](#19-understand-partition-query-performance-trade-offs)
   - 1.10 [Use Enum for Finite Value Sets](#110-use-enum-for-finite-value-sets)
   - 1.11 [Use JSON Type for Dynamic Schemas](#111-use-json-type-for-dynamic-schemas)
   - 1.12 [Use LowCardinality for Repeated Strings](#112-use-lowcardinality-for-repeated-strings)
   - 1.13 [Use Native Types Instead of String](#113-use-native-types-instead-of-string)
   - 1.14 [Use Partitioning for Data Lifecycle Management](#114-use-partitioning-for-data-lifecycle-management)
2. [Query Optimization](#2-query-optimization) — **CRITICAL**
   - 2.1 [Choose the Right JOIN Algorithm](#21-choose-the-right-join-algorithm)
   - 2.2 [Consider Alternatives to JOINs](#22-consider-alternatives-to-joins)
   - 2.3 [Filter Tables Before Joining](#23-filter-tables-before-joining)
   - 2.4 [Optimize NULL Handling in Outer JOINs](#24-optimize-null-handling-in-outer-joins)
   - 2.5 [Use ANY JOIN When Only One Match Needed](#25-use-any-join-when-only-one-match-needed)
   - 2.6 [Use Data Skipping Indices for Non-ORDER BY Filters](#26-use-data-skipping-indices-for-non-order-by-filters)
   - 2.7 [Use Incremental MVs for Real-Time Aggregations](#27-use-incremental-mvs-for-real-time-aggregations)
   - 2.8 [Use Refreshable MVs for Complex Joins and Batch Workflows](#28-use-refreshable-mvs-for-complex-joins-and-batch-workflows)
3. [Insert Strategy](#3-insert-strategy) — **CRITICAL**
   - 3.1 [Avoid ALTER TABLE DELETE](#31-avoid-alter-table-delete)
   - 3.2 [Avoid ALTER TABLE UPDATE](#32-avoid-alter-table-update)
   - 3.3 [Avoid OPTIMIZE TABLE FINAL](#33-avoid-optimize-table-final)
   - 3.4 [Batch Inserts Appropriately (10K-100K rows)](#34-batch-inserts-appropriately-10k-100k-rows)
   - 3.5 [Use Async Inserts for High-Frequency Small Batches](#35-use-async-inserts-for-high-frequency-small-batches)
   - 3.6 [Use Native Format for Best Insert Performance](#36-use-native-format-for-best-insert-performance)

---

## 1. Schema Design

**Impact: CRITICAL**

Proper schema design is foundational to ClickHouse performance. ORDER BY is immutable after table creation; wrong choices require full data migration. Includes primary key selection, data types, partitioning strategy, and JSON usage. Column types and ordering can impact query speed by orders of magnitude.

### 1.1 Avoid Nullable Unless Semantically Required

**Impact: HIGH (Nullable adds storage overhead; use DEFAULT values instead)**

Nullable columns maintain a separate UInt8 column for tracking null values, increasing storage and degrading performance. Use DEFAULT values instead when feasible.

**Incorrect: Nullable everywhere**

```sql
CREATE TABLE users (
    id Nullable(UInt64),              -- IDs should never be null
    name Nullable(String),            -- Empty string is fine
    age Nullable(UInt8),              -- 0 is a valid default
    login_count Nullable(UInt32)      -- 0 is a valid default
)
```

**Correct: DEFAULT values, Nullable only when semantic**

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

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.2 Consider Starting Without Partitioning

**Impact: MEDIUM (Add partitioning later when you have clear lifecycle requirements)**

Start without partitioning and add it later only if:

- You have clear data lifecycle requirements (retention, archiving)

- Your access patterns clearly benefit from partition pruning

- You understand the cardinality implications

**Example: start simple**

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

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.3 Filter on ORDER BY Columns in Queries

**Impact: CRITICAL (Skipping prefix columns prevents index usage)**

Even with good schema design, queries must use ORDER BY columns to benefit. Skipping prefix columns or filtering on non-ORDER BY columns prevents index usage.

**Incorrect: skips prefix or uses non-ORDER BY columns**

```sql
-- Given: ORDER BY (tenant_id, event_type, timestamp)

-- Skips prefix columns - can't use index effectively
SELECT * FROM events WHERE event_type = 'click';

-- Filter on column not in ORDER BY - full table scan
SELECT * FROM events WHERE user_agent LIKE '%Chrome%';
```

**Correct: uses ORDER BY prefix**

```sql
-- Given: ORDER BY (tenant_id, event_type, timestamp)

-- Full prefix match - best performance
SELECT * FROM events
WHERE tenant_id = 123 AND event_type = 'click';

-- Partial prefix - still uses index
SELECT * FROM events WHERE tenant_id = 123;

-- Range on later column after equality on earlier
SELECT * FROM events
WHERE tenant_id = 123 AND event_type = 'click' AND timestamp >= '2024-01-01';
```

**Index usage reference:**

| Filter | Index Used? |

|--------|-------------|

| `WHERE tenant_id = 123` | Full |

| `WHERE tenant_id = 123 AND event_type = 'click'` | Full |

| `WHERE event_type = 'click'` | None (skipped prefix) |

| `WHERE timestamp > '2024-01-01'` | None (skipped both) |

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.4 Keep Partition Cardinality Low (100-1,000 Values)

**Impact: HIGH (Too many partitions cause part explosion and 'too many parts' errors)**

Too many distinct partition values create excessive data parts, eventually triggering "too many parts" errors. ClickHouse enforces limits via `max_parts_in_total` and `parts_to_throw_insert` settings.

**Incorrect: high cardinality partitioning**

```sql
-- High cardinality = too many partitions
CREATE TABLE events (...)
ENGINE = MergeTree()
PARTITION BY user_id  -- Millions of partitions!
ORDER BY (timestamp);

-- Daily partitions can grow unbounded over years
CREATE TABLE logs (...)
ENGINE = MergeTree()
PARTITION BY toDate(timestamp)  -- 3650 partitions over 10 years
ORDER BY (service, timestamp);
```

**Correct: bounded cardinality**

```sql
-- Monthly partitions = 12 per year, bounded cardinality
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String),
    user_id UInt64
)
ENGINE = MergeTree()
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (event_type, timestamp);
```

**Validation:**

```sql
-- Check partition count and health
SELECT
    partition,
    count() as parts,
    sum(rows) as rows,
    formatReadableSize(sum(bytes_on_disk)) as size
FROM system.parts
WHERE table = 'events' AND active
GROUP BY partition
ORDER BY partition;

-- Warning signs: hundreds or thousands of partitions
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.5 Minimize Bit-Width for Numeric Types

**Impact: HIGH (Smaller types reduce storage and improve cache efficiency)**

Select the smallest numeric type that accommodates your data range. Prefer unsigned types when negative values aren't needed.

**Incorrect: oversized types**

```sql
CREATE TABLE metrics (
    status_code Int64,        -- HTTP codes are 100-599
    age Int64,                -- Human age fits in UInt8
    year Int64,               -- Years fit in UInt16
    item_count Int64          -- Often small numbers
)
```

**Correct: right-sized types**

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

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.6 Order Columns by Cardinality (Low to High)

**Impact: CRITICAL (Enables granule skipping; high-cardinality first prevents index pruning)**

Since the sparse primary index operates on data blocks (granules) rather than individual rows, low-cardinality leading columns create more useful index entries that can skip entire blocks. Place lower-cardinality columns before higher-cardinality ones in the ordering key.

**Incorrect: high cardinality first**

```sql
-- UUID first means no pruning benefit
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_id, event_type, timestamp);
-- Every granule has different event_id values, index can't skip anything
```

**Correct: low cardinality first**

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

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.7 Plan PRIMARY KEY Before Table Creation

**Impact: CRITICAL (ORDER BY is immutable; wrong choice requires full data migration)**

ClickHouse's ORDER BY clause defines physical data ordering and the sparse index. Unlike other databases, **ORDER BY cannot be modified after table creation**. A wrong choice requires creating a new table and migrating all data.

**Incorrect: arbitrary ORDER BY without query analysis**

```sql
-- Creating table without analyzing query patterns
CREATE TABLE events (
    event_id UUID,
    user_id UInt64,
    timestamp DateTime
)
ENGINE = MergeTree()
ORDER BY (event_id);  -- Chosen arbitrarily

-- Later: "Most queries filter by user_id!"
-- Cannot fix with: ALTER TABLE events MODIFY ORDER BY (user_id, timestamp)
-- ERROR: Cannot modify ORDER BY
```

**Correct: query-driven ORDER BY selection**

```sql
-- Step 1: Document query patterns BEFORE creating table
/*
Query Analysis:
- 60% of queries: WHERE user_id = ? AND timestamp BETWEEN ? AND ?
- 25% of queries: WHERE event_type = ? AND timestamp > ?
- 15% of queries: WHERE event_id = ?

Conclusion: user_id and event_type are primary filters
*/

-- Step 2: Create table with correct ORDER BY
CREATE TABLE events (
    event_id UUID DEFAULT generateUUIDv4(),
    user_id UInt64,
    event_type LowCardinality(String),
    timestamp DateTime,
    event_date Date DEFAULT toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (user_id, event_date, event_id);
```

**Pre-creation checklist:**

- [ ] Listed top 5-10 query patterns

- [ ] Identified columns in WHERE clauses with frequency

- [ ] Prioritized columns that exclude large numbers of rows

- [ ] Ordered columns by cardinality (low first, high last)

- [ ] Limited to 4-5 key columns (typically sufficient)

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.8 Prioritize Filter Columns in ORDER BY

**Impact: CRITICAL (Columns not in ORDER BY cause full table scans)**

Prioritize columns frequently used in query filters (WHERE clause), especially those that exclude large numbers of rows. Queries filtering on columns not in ORDER BY result in full table scans.

**Incorrect: ORDER BY doesn't match query patterns**

```sql
-- If most queries filter by tenant_id:
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (event_id);  -- Queries by tenant_id will full-scan!
```

**Correct: ORDER BY matches filter patterns**

```sql
-- ORDER BY matches query filter patterns
CREATE TABLE events (...)
ENGINE = MergeTree()
ORDER BY (tenant_id, event_date, event_id);

-- Query now uses primary index:
SELECT * FROM events WHERE tenant_id = 123 AND event_date >= '2024-01-01';
```

**Validation:**

```sql
-- Verify index usage
EXPLAIN indexes = 1
SELECT * FROM events WHERE tenant_id = 123;
-- Look for "PrimaryKey" with Key Condition
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-primary-key](https://clickhouse.com/docs/best-practices/choosing-a-primary-key)

### 1.9 Understand Partition Query Performance Trade-offs

**Impact: MEDIUM (Partition pruning helps some queries; spanning many partitions hurts others)**

Partitioning can help or hurt query performance:

- **Potential improvement**: Queries filtering by partition key may benefit from partition pruning

- **Potential degradation**: Queries spanning many partitions increase total parts scanned

ClickHouse automatically builds **MinMax indexes** on partition columns. Data merges occur **within partitions only**, not across them.

**Incorrect: query scans all partitions**

```sql
-- Query must scan all partitions
SELECT count(*) FROM events
WHERE event_type = 'click';  -- No partition pruning
```

**Correct: query prunes to single partition**

```sql
-- Query prunes to single partition
SELECT count(*) FROM events
WHERE timestamp >= '2024-01-01' AND timestamp < '2024-02-01'
  AND event_type = 'click';
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

### 1.10 Use Enum for Finite Value Sets

**Impact: MEDIUM (Insert-time validation and natural ordering; 1-2 bytes storage)**

Enum types provide validation at insert time and enable queries that exploit natural ordering. Use Enum8 (up to 256 values) or Enum16 (up to 65,536 values).

**Incorrect: String without validation**

```sql
CREATE TABLE orders (
    status String    -- No validation, typos like "shiped" allowed
)

-- Ordering requires CASE statements
SELECT * FROM orders ORDER BY
    CASE status
        WHEN 'pending' THEN 1
        WHEN 'processing' THEN 2
        WHEN 'shipped' THEN 3
    END;
```

**Correct: Enum with validation and ordering**

```sql
CREATE TABLE orders (
    status Enum8('pending' = 1, 'processing' = 2, 'shipped' = 3, 'delivered' = 4)
)

-- Insert validation: invalid values rejected
INSERT INTO orders VALUES ('shiped');  -- ERROR: Unknown element 'shiped'

-- Natural ordering works automatically
SELECT * FROM orders ORDER BY status;  -- Orders by enum value (1, 2, 3, 4)

-- Comparisons use natural order
SELECT * FROM orders WHERE status > 'processing';  -- shipped and delivered
```

**Enum Guidelines:**

| Scenario | Use |

|----------|-----|

| Fixed set of values known at schema time | Enum8/Enum16 |

| Values may change frequently | LowCardinality(String) |

| Need insert-time validation | Enum |

| Need natural ordering in queries | Enum |

| < 256 distinct values | Enum8 (1 byte) |

| 256-65,536 distinct values | Enum16 (2 bytes) |

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.11 Use JSON Type for Dynamic Schemas

**Impact: MEDIUM (Field-level querying for semi-structured data; use typed columns for known schemas)**

ClickHouse's JSON type splits JSON objects into separate sub-columns, enabling field-level query optimization. Use it for truly dynamic data, not everything.

**Incorrect: schema bloat or opaque String**

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

**Correct: JSON for dynamic, typed for known**

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

```sql
CREATE TABLE events (
    properties JSON(
        url String,
        amount Float64,
        product_id UInt64
    )
)
```

| Scenario | Use JSON? |

|----------|-----------|

| Data structure varies unpredictably | Yes |

| Field types/schemas change over time | Yes |

| Need field-level querying | Yes |

| Fixed, known schema | No (use typed columns) |

| JSON as opaque blob (no field queries) | No (use String) |

**Optimization: specify types for known paths:**

Reference: [https://clickhouse.com/docs/best-practices/use-json-where-appropriate](https://clickhouse.com/docs/best-practices/use-json-where-appropriate)

### 1.12 Use LowCardinality for Repeated Strings

**Impact: HIGH (Dictionary encoding for <10K unique values; significant storage reduction)**

String columns with repeated values store each value repeatedly. LowCardinality uses dictionary encoding for significant storage reduction.

**Incorrect: plain String for repeated values**

```sql
CREATE TABLE events (
    country String,       -- "United States" stored 500M times
    browser String,       -- "Chrome" stored 300M times
    event_type String     -- "page_view" stored 800M times
)
```

**Correct: LowCardinality for low unique counts**

```sql
CREATE TABLE events (
    country LowCardinality(String),      -- ~200 unique values
    browser LowCardinality(String),      -- ~50 unique values
    event_type LowCardinality(String)    -- ~100 unique values
)
```

**When to use LowCardinality:**

```sql
-- Check cardinality before deciding
SELECT uniq(column_name) FROM table_name;
```

| Unique Values | Recommendation |

|---------------|----------------|

| < 10,000 | Use LowCardinality |

| > 10,000 | Use regular String |

**LowCardinality vs FixedString:**

```sql
-- FixedString: Only for truly fixed-length data
country_code FixedString(2),    -- "US", "DE", "JP" - always 2 chars

-- LowCardinality: For variable-length low-cardinality strings
country_name LowCardinality(String),  -- "United States", "Germany"
```

Reserve `FixedString` for strictly fixed-length data (e.g., 2-char country codes). For most low-cardinality text, `LowCardinality(String)` outperforms `FixedString`.

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.13 Use Native Types Instead of String

**Impact: CRITICAL (2-10x storage reduction; enables compression and correct semantics)**

Using String for all data wastes storage, prevents compression optimization, and makes comparisons slower. ClickHouse's column-oriented architecture benefits directly from optimal type selection.

**Incorrect: String for everything**

```sql
CREATE TABLE events (
    event_id String,        -- "550e8400-e29b-41d4-a716-446655440000" = 36 bytes
    user_id String,         -- "12345" = 5 bytes (no numeric operations)
    created_at String,      -- "2024-01-15 10:30:00" = 19 bytes
    count String,           -- "42" - can't do math!
    is_active String        -- "true" = 4 bytes
)
```

**Correct: native types**

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

Reference: [https://clickhouse.com/docs/best-practices/select-data-types](https://clickhouse.com/docs/best-practices/select-data-types)

### 1.14 Use Partitioning for Data Lifecycle Management

**Impact: HIGH (DROP PARTITION is instant; DELETE is expensive row-by-row scan)**

Partitioning is **primarily a data management technique, not a query optimization tool**. It excels at:

- **Dropping data**: Remove entire partitions as single metadata operations

- **TTL retention**: Implement time-based retention policies efficiently

- **Tiered storage**: Move old partitions to cold storage

- **Archiving**: Move partitions between tables

**Incorrect: no time alignment for lifecycle**

```sql
-- Cannot efficiently drop old data by time
CREATE TABLE events (...)
ENGINE = MergeTree()
PARTITION BY event_type  -- No time alignment
ORDER BY (timestamp);

-- Slow: must scan and delete row by row
DELETE FROM events WHERE timestamp < '2023-01-01';
```

**Correct: time-based for lifecycle**

```sql
CREATE TABLE events (
    timestamp DateTime,
    event_type LowCardinality(String)
)
ENGINE = MergeTree()
PARTITION BY toStartOfMonth(timestamp)
ORDER BY (event_type, timestamp)
TTL timestamp + INTERVAL 1 YEAR DELETE;  -- Drops whole partitions

-- Fast: metadata-only operation
ALTER TABLE events DROP PARTITION '202301';

-- Archive to cold storage
ALTER TABLE events_archive ATTACH PARTITION '202301' FROM events;
```

Reference: [https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key](https://clickhouse.com/docs/best-practices/choosing-a-partitioning-key)

---

## 2. Query Optimization

**Impact: CRITICAL**

Query patterns dramatically affect performance. JOIN algorithms, filtering strategies, skipping indices, and materialized views can reduce query time from minutes to milliseconds. Pre-computed aggregations read thousands of rows instead of billions.

### 2.1 Choose the Right JOIN Algorithm

**Impact: CRITICAL (Wrong algorithm causes OOM; right algorithm handles large tables efficiently)**

ClickHouse's default hash join loads the RIGHT table entirely into memory. Choose the right algorithm based on table sizes and constraints.

**Algorithm selection:**

| Algorithm | Best For | Trade-off |

|-----------|----------|-----------|

| `parallel_hash` | Small-to-medium in-memory tables | Default since 24.11; fast, concurrent |

| `hash` | General purpose, all join types | Single-threaded hash table build |

| `direct` | Dictionary lookups (INNER/LEFT only) | Fastest; no hash table construction |

| `full_sorting_merge` | Tables already sorted on join key | Skips sort if pre-ordered; low memory |

| `partial_merge` | Large tables, memory-constrained | Minimized memory; slower execution |

| `grace_hash` | Large datasets, tunable memory | Flexible; disk-spilling capability |

| `auto` | Adaptive algorithm selection | Tries hash first, falls back on memory pressure |

**Example usage:**

```sql
-- Let ClickHouse choose automatically
SET join_algorithm = 'auto';

-- For large-to-large joins where memory is constrained
SET join_algorithm = 'partial_merge';
SELECT * FROM large_a JOIN large_b ON large_b.id = large_a.id;

-- When joining by primary key columns, sort-merge skips sorting step
SET join_algorithm = 'full_sorting_merge';
SELECT * FROM table_a a JOIN table_b b ON b.pk_col = a.pk_col;
```

**Note:** ClickHouse 24.12+ automatically positions smaller tables on the right side. For earlier versions, manually ensure the smaller table is on the RIGHT.

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.2 Consider Alternatives to JOINs

**Impact: CRITICAL (Dictionaries and denormalization shift work from query time to insert time)**

Repeated JOINs to dimension tables add overhead. Dictionaries or denormalization shift computational work from query time to insert/pre-processing time.

**Incorrect: JOIN on every query**

```sql
-- JOIN on every query
SELECT o.order_id, c.name, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01';
```

**Correct - Dictionary Lookup:**

```sql
-- Create dictionary
CREATE DICTIONARY customer_dict (
    id UInt64,
    name String,
    email String
)
PRIMARY KEY id
SOURCE(CLICKHOUSE(TABLE 'customers'))
LAYOUT(HASHED())
LIFETIME(MIN 300 MAX 360);

-- Use dictGet instead of JOIN (uses direct join algorithm - fastest)
SELECT
    order_id,
    dictGet('customer_dict', 'name', customer_id) as customer_name,
    dictGet('customer_dict', 'email', customer_id) as customer_email
FROM orders
WHERE created_at > '2024-01-01';
```

**Correct - Denormalization:**

```sql
-- Denormalized table with materialized view
CREATE MATERIALIZED VIEW orders_enriched_mv TO orders_enriched AS
SELECT
    o.order_id, o.customer_id,
    c.name as customer_name,
    c.email as customer_email,
    o.total, o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id;
```

**Approach comparison:**

| Approach | Use Case | Performance |

|----------|----------|-------------|

| Dictionary | Frequent lookups to small dimension | Fastest (in-memory) |

| Denormalization | Analytics always need enriched data | Fast (no join at query) |

| IN subquery | Existence filtering | Often faster than JOIN |

| JOIN | Infrequent or complex joins | Acceptable |

**Critical dictionary caveat:** Dictionaries silently deduplicate duplicate keys, retaining only the final value. Only use when source has unique keys.

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.3 Filter Tables Before Joining

**Impact: CRITICAL (Joining full tables then filtering wastes resources)**

Joining full tables then filtering wastes resources. Add filtering in `WHERE` or `JOIN ON` clauses. If automatic pushdown fails, restructure as a subquery.

**Incorrect: join then filter**

```sql
-- Joins entire tables, then filters
SELECT o.order_id, c.name, o.total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at > '2024-01-01' AND c.country = 'US';
```

**Correct: filter in subqueries before joining**

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

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.4 Optimize NULL Handling in Outer JOINs

**Impact: MEDIUM (Default values instead of NULL reduces memory overhead)**

Set `join_use_nulls = 0` to use default column values instead of NULL markers, reducing memory overhead compared to Nullable wrappers.

**Example:**

```sql
-- Use default values instead of NULLs for non-matching rows
SET join_use_nulls = 0;

SELECT o.order_id, c.name
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id;
-- Non-matching rows get '' for name instead of NULL
```

**When to use:**

| Setting | Behavior | Use Case |

|---------|----------|----------|

| `join_use_nulls = 0` | Default values (empty string, 0) for non-matches | When you can handle default values |

| `join_use_nulls = 1` (default) | NULL for non-matches | When you need to distinguish "no match" from "matched with default" |

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.5 Use ANY JOIN When Only One Match Needed

**Impact: HIGH (Returns first match only; less memory and faster execution)**

Use `ANY` JOINs when you only need a single match rather than all matches. They consume less memory and execute faster.

**Incorrect: returns all matches**

```sql
-- Returns all matching rows, uses more memory
SELECT o.order_id, c.name
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id;
```

**Correct: returns first match only**

```sql
-- Returns only first match per row, faster and less memory
SELECT o.order_id, c.name
FROM orders o
LEFT ANY JOIN customers c ON c.id = o.customer_id;
```

**ANY JOIN types:**

| Type | Behavior |

|------|----------|

| `LEFT ANY JOIN` | At most one match from right table |

| `INNER ANY JOIN` | At most one match, only matching rows |

| `RIGHT ANY JOIN` | At most one match from left table |

Reference: [https://clickhouse.com/docs/best-practices/minimize-optimize-joins](https://clickhouse.com/docs/best-practices/minimize-optimize-joins)

### 2.6 Use Data Skipping Indices for Non-ORDER BY Filters

**Impact: HIGH (Up to 60x faster queries by skipping irrelevant granules)**

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

**Incorrect: filtering on non-ORDER BY column**

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

**Correct: add skipping index**

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

Reference: [https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate](https://clickhouse.com/docs/best-practices/use-data-skipping-indices-where-appropriate)

### 2.7 Use Incremental MVs for Real-Time Aggregations

**Impact: HIGH (Read thousands of rows instead of billions; minimal cluster overhead)**

Incremental MVs automatically apply the view's query to new data blocks at insert time. Results are written to a target table and partial results merge over time.

**Incorrect: full aggregation on every query**

```sql
-- Full aggregation on every dashboard load
SELECT
    event_type,
    toStartOfHour(timestamp) as hour,
    count() as events,
    uniq(user_id) as unique_users
FROM events
WHERE timestamp >= now() - INTERVAL 7 DAY
GROUP BY event_type, hour;
-- Scans 7 days of data every time (billions of rows)
```

**Correct: incremental MV with pre-aggregation**

```sql
-- Create target table for aggregated data
CREATE TABLE events_hourly (
    event_type LowCardinality(String),
    hour DateTime,
    events AggregateFunction(count),
    unique_users AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree()
ORDER BY (event_type, hour);

-- Create materialized view to populate incrementally
CREATE MATERIALIZED VIEW events_hourly_mv TO events_hourly AS
SELECT
    event_type,
    toStartOfHour(timestamp) as hour,
    countState() as events,
    uniqState(user_id) as unique_users
FROM events
GROUP BY event_type, hour;

-- Query the pre-aggregated data
SELECT
    event_type, hour,
    countMerge(events) as events,
    uniqMerge(unique_users) as unique_users
FROM events_hourly
WHERE hour >= now() - INTERVAL 7 DAY
GROUP BY event_type, hour;
-- Reads thousands of rows instead of billions
```

**Key points:**

- Use `-State` functions in MV, `-Merge` functions in query

- Incremental - existing data not automatically included (backfill separately)

- Minimal cluster overhead at insert time

Reference: [https://clickhouse.com/docs/best-practices/use-materialized-views](https://clickhouse.com/docs/best-practices/use-materialized-views)

### 2.8 Use Refreshable MVs for Complex Joins and Batch Workflows

**Impact: HIGH (Sub-millisecond queries with periodic refresh; ideal for complex joins)**

Refreshable MVs execute queries periodically on a schedule. The full query re-executes and overwrites (or appends to) the target table.

**Best for:**

- Sub-millisecond latency where minor staleness is acceptable

- Caching "top N" results or lookup tables

- Complex multi-table joins requiring denormalization

- Batch workflows and DAG dependencies

**Incorrect: expensive join on every request**

```sql
-- Complex join executed on every request
SELECT
    o.order_id, o.total,
    c.name as customer_name,
    p.name as product_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at >= now() - INTERVAL 1 DAY;
```

**Correct: refreshable MV**

```sql
-- Create refreshable MV that runs every 5 minutes
CREATE MATERIALIZED VIEW orders_denormalized
REFRESH EVERY 5 MINUTE
ENGINE = MergeTree()
ORDER BY (created_at, order_id)
AS SELECT
    o.order_id, o.created_at, o.total,
    c.name as customer_name, c.segment,
    p.name as product_name
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at >= now() - INTERVAL 1 DAY;

-- Query the pre-joined data (sub-millisecond)
SELECT * FROM orders_denormalized WHERE segment = 'enterprise';
```

**APPEND vs REPLACE modes:**

| Mode | Behavior | Use Case |

|------|----------|----------|

| `REPLACE` (default) | Overwrites previous contents | Current state, lookup tables |

| `APPEND` | Adds new rows to existing data | Periodic snapshots, historical accumulation |

**Critical warning:** Query should run quickly compared to refresh interval. Don't schedule every 10 seconds if the query takes 10+ seconds.

Reference: [https://clickhouse.com/docs/best-practices/use-materialized-views](https://clickhouse.com/docs/best-practices/use-materialized-views)

---

## 3. Insert Strategy

**Impact: CRITICAL**

Each INSERT creates a data part. Single-row inserts overwhelm the merge process. Proper batching (10K-100K rows), async inserts for high-frequency writes, mutation avoidance, and letting background merges work are essential for stable cluster performance.

### 3.1 Avoid ALTER TABLE DELETE

**Impact: CRITICAL (Use lightweight DELETE, CollapsingMergeTree, or DROP PARTITION instead)**

`ALTER TABLE DELETE` is a mutation that rewrites entire data parts. Use alternatives like lightweight DELETE, CollapsingMergeTree, or DROP PARTITION.

**Incorrect: mutation delete**

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

Reference: [https://clickhouse.com/docs/best-practices/avoid-mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)

### 3.2 Avoid ALTER TABLE UPDATE

**Impact: CRITICAL (Mutations rewrite entire parts; use ReplacingMergeTree instead)**

`ALTER TABLE UPDATE` is a mutation - an asynchronous background process that rewrites entire data parts affected by the change. This is extremely expensive for frequent or large-scale operations.

**Why mutations are problematic:**

- **Write amplification:** Rewrite complete parts even for minor changes

- **Disk I/O spike:** Degrades overall cluster performance

- **No rollback:** Cannot be rolled back after submission

- **Inconsistent reads:** SELECT may read mix of mutated and unmutated parts

**Incorrect: mutation for updates**

```sql
-- Rewrites potentially huge amounts of data
ALTER TABLE users UPDATE status = 'inactive'
WHERE last_login < now() - INTERVAL 90 DAY;

-- Frequent row updates via mutation
ALTER TABLE inventory UPDATE quantity = quantity - 1
WHERE product_id = 123;
-- If product exists across 100 parts, rewrites ALL 100 parts
```

**Correct: ReplacingMergeTree**

```sql
-- Table design for updates
CREATE TABLE users (
    user_id UInt64,
    name String,
    status LowCardinality(String),
    updated_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_id;

-- "Update" by inserting new version
INSERT INTO users (user_id, name, status)
VALUES (123, 'John', 'inactive');

-- Query with FINAL to get latest version
SELECT * FROM users FINAL WHERE user_id = 123;

-- Or use aggregation
SELECT user_id, argMax(status, updated_at) as status
FROM users GROUP BY user_id;
```

Reference: [https://clickhouse.com/docs/best-practices/avoid-mutations](https://clickhouse.com/docs/best-practices/avoid-mutations)

### 3.3 Avoid OPTIMIZE TABLE FINAL

**Impact: HIGH (Forces expensive merge of all parts; let background merges work)**

`OPTIMIZE TABLE ... FINAL` forces immediate merge of all parts into one part per partition. This is resource-intensive and rarely necessary. ClickHouse already performs smart background merges.

**Note:** `OPTIMIZE FINAL` is not the same as `FINAL`. The `FINAL` modifier in SELECT queries may be necessary for deduplicated results in ReplacingMergeTree and is generally fine to use.

**Incorrect: OPTIMIZE FINAL after inserts**

```sql
-- Running OPTIMIZE FINAL after every batch insert
INSERT INTO events SELECT * FROM staging_events;
OPTIMIZE TABLE events FINAL;  -- Expensive and unnecessary!

-- Scheduled OPTIMIZE FINAL jobs
-- Cron: 0 * * * * clickhouse-client -q "OPTIMIZE TABLE events FINAL"
```

**Correct: let background merges work**

```sql
-- Let background merges handle optimization
INSERT INTO events SELECT * FROM staging_events;
-- Done! ClickHouse merges automatically

-- For ReplacingMergeTree deduplication, use FINAL in queries
SELECT * FROM events FINAL WHERE user_id = 123;
-- Instead of running OPTIMIZE FINAL to deduplicate
```

**Problems with OPTIMIZE FINAL:**

- Rewrites entire partition regardless of need

- Ignores the ~150 GB part size safeguard

- Can cause memory pressure or OOM errors

- Lengthy execution time for large datasets

**When OPTIMIZE FINAL may be acceptable:**

- Finalizing data before table freezing

- Preparing data for export operations

- One-time operations, not regular workflows

**Better alternatives:**

| Need | Alternative |

|------|-------------|

| Deduplicate ReplacingMergeTree | Use `FINAL` modifier in SELECT |

| Reduce part count | Rely on background merges |

Reference: [https://clickhouse.com/docs/best-practices/avoid-optimize-final](https://clickhouse.com/docs/best-practices/avoid-optimize-final)

### 3.4 Batch Inserts Appropriately (10K-100K rows)

**Impact: CRITICAL (Each INSERT creates a part; single-row inserts overwhelm merge process)**

Each INSERT creates a new data part. Single-row or small-batch inserts create thousands of tiny parts, overwhelming the merge process and causing cluster instability.

**Incorrect: single-row or tiny batches**

```python
# Single-row inserts - creates 10,000 parts!
for event in events:
    client.execute("INSERT INTO events VALUES", [event])

# Tiny batches - still too many parts
for batch in chunks(events, 100):  # 100 rows per INSERT
    client.execute("INSERT INTO events VALUES", batch)
```

**Correct: proper batch size**

```python
# Ideal batch size: 10,000-100,000 rows
BATCH_SIZE = 10_000
for batch in chunks(events, BATCH_SIZE):
    client.execute("INSERT INTO events VALUES", batch)
```

**Recommended batch sizes:**

| Threshold | Value |

|-----------|-------|

| Minimum | 1,000 rows |

| Ideal range | 10,000-100,000 rows |

| Insert rate (sync) | ~1 insert per second |

**Validation:**

```sql
-- Monitor part count (>3000 per partition blocks inserts)
SELECT table, count() as parts, sum(rows) as total_rows
FROM system.parts
WHERE active AND database = 'default'
GROUP BY table
ORDER BY parts DESC;
```

Reference: [https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

### 3.5 Use Async Inserts for High-Frequency Small Batches

**Impact: HIGH (Server-side buffering when client batching isn't practical)**

When client-side batching isn't practical, async inserts buffer server-side and create larger parts automatically.

**Incorrect: small batches without async**

```python
# Small batches without async_insert - creates too many parts
for batch in chunks(events, 100):
    client.execute("INSERT INTO events VALUES", batch)
```

**Correct: enable async inserts**

```sql
-- Configure server-side for specific users
ALTER USER my_app_user SETTINGS
    async_insert = 1,
    wait_for_async_insert = 1,
    async_insert_max_data_size = 10000000,  -- Flush at 10MB
    async_insert_busy_timeout_ms = 1000;    -- Flush after 1s
```

**Flush conditions: whichever occurs first**

- Buffer reaches `async_insert_max_data_size`

- Time threshold `async_insert_busy_timeout_ms` elapses

- Maximum insert queries accumulate

**Return modes:**

| Setting | Behavior | Use Case |

|---------|----------|----------|

| `wait_for_async_insert=1` | Waits for flush, confirms durability | **Recommended** |

| `wait_for_async_insert=0` | Fire-and-forget, unaware of errors | **Risky** - only if you accept data loss |

Reference: [https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

### 3.6 Use Native Format for Best Insert Performance

**Impact: MEDIUM (Native format is most efficient; JSONEachRow is expensive to parse)**

Data format affects insert performance. Native format is column-oriented with minimal parsing overhead.

**Performance Ranking: fastest to slowest**

| Format | Notes |

|--------|-------|

| **Native** | Most efficient. Column-oriented, minimal parsing. Recommended. |

| **RowBinary** | Efficient row-based alternative |

| **JSONEachRow** | Easier to use but expensive to parse |

**Example:**

```python
# Use Native format for best performance
client.execute("INSERT INTO events VALUES", data, settings={'input_format': 'Native'})
```

Reference: [https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy](https://clickhouse.com/docs/best-practices/selecting-an-insert-strategy)

---

## References

1. [https://clickhouse.com/docs](https://clickhouse.com/docs)
2. [https://github.com/ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse)
