---
name: clickhouse-best-practices
description: MUST USE when reviewing ClickHouse schemas, queries, or configurations. Contains 28 rules that MUST be checked before providing recommendations. Always read relevant rule files and cite specific rules in responses.
license: Apache-2.0
metadata:
  author: ClickHouse Inc
  version: "0.3.0"
---

# ClickHouse Best Practices

Comprehensive guidance for ClickHouse covering schema design, query optimization, and data ingestion. Contains 28 rules across 3 main categories (schema, query, insert), prioritized by impact.

> **Official docs:** [ClickHouse Best Practices](https://clickhouse.com/docs/best-practices)

## IMPORTANT: How to Apply This Skill

**Before answering ClickHouse questions, follow this priority order:**

1. **Check for applicable rules** in the `rules/` directory
2. **If rules exist:** Apply them and cite them in your response using "Per `rule-name`..."
3. **If no rule exists:** Use the LLM's ClickHouse knowledge or search documentation
4. **If uncertain:** Use web search for current best practices
5. **Always cite your source:** rule name, "general ClickHouse guidance", or URL

**Why rules take priority:** ClickHouse has specific behaviors (columnar storage, sparse indexes, merge tree mechanics) where general database intuition can be misleading. The rules encode validated, ClickHouse-specific guidance.

### For Formal Reviews

When performing a formal review of schemas, queries, or data ingestion:

---

## Review Procedures

### For Schema Reviews (CREATE TABLE, ALTER TABLE)

**Read these rule files in order:**

1. `rules/schema-pk-plan-before-creation.md` - ORDER BY is immutable
2. `rules/schema-pk-cardinality-order.md` - Column ordering in keys
3. `rules/schema-pk-prioritize-filters.md` - Filter column inclusion
4. `rules/schema-types-native-types.md` - Proper type selection
5. `rules/schema-types-minimize-bitwidth.md` - Numeric type sizing
6. `rules/schema-types-lowcardinality.md` - LowCardinality usage
7. `rules/schema-types-avoid-nullable.md` - Nullable vs DEFAULT
8. `rules/schema-partition-low-cardinality.md` - Partition count limits
9. `rules/schema-partition-lifecycle.md` - Partitioning purpose

**Check for:**
- [ ] PRIMARY KEY / ORDER BY column order (low-to-high cardinality)
- [ ] Data types match actual data ranges
- [ ] LowCardinality applied to appropriate string columns
- [ ] Partition key cardinality bounded (100-1,000 values)
- [ ] ReplacingMergeTree has version column if used

### For Query Reviews (SELECT, JOIN, aggregations)

**Read these rule files:**

1. `rules/query-join-choose-algorithm.md` - Algorithm selection
2. `rules/query-join-filter-before.md` - Pre-join filtering
3. `rules/query-join-use-any.md` - ANY vs regular JOIN
4. `rules/query-index-skipping-indices.md` - Secondary index usage
5. `rules/schema-pk-filter-on-orderby.md` - Filter alignment with ORDER BY

**Check for:**
- [ ] Filters use ORDER BY prefix columns
- [ ] JOINs filter tables before joining (not after)
- [ ] Correct JOIN algorithm for table sizes
- [ ] Skipping indices for non-ORDER BY filter columns

### For Insert Strategy Reviews (data ingestion, updates, deletes)

**Read these rule files:**

1. `rules/insert-batch-size.md` - Batch sizing requirements
2. `rules/insert-mutation-avoid-update.md` - UPDATE alternatives
3. `rules/insert-mutation-avoid-delete.md` - DELETE alternatives
4. `rules/insert-async-small-batches.md` - Async insert usage
5. `rules/insert-optimize-avoid-final.md` - OPTIMIZE TABLE risks

**Check for:**
- [ ] Batch size 10K-100K rows per INSERT
- [ ] No ALTER TABLE UPDATE for frequent changes
- [ ] ReplacingMergeTree or CollapsingMergeTree for update patterns
- [ ] Async inserts enabled for high-frequency small batches

---

## Output Format

Structure your response as follows:

```
## Rules Checked
- `rule-name-1` - Compliant / Violation found
- `rule-name-2` - Compliant / Violation found
...

## Findings

### Violations
- **`rule-name`**: Description of the issue
  - Current: [what the code does]
  - Required: [what it should do]
  - Fix: [specific correction]

### Compliant
- `rule-name`: Brief note on why it's correct

## Recommendations
[Prioritized list of changes, citing rules]
```

---

## Rule Categories by Priority

| Priority | Category | Impact | Prefix | Rule Count |
|----------|----------|--------|--------|------------|
| 1 | Primary Key Selection | CRITICAL | `schema-pk-` | 4 |
| 2 | Data Type Selection | CRITICAL | `schema-types-` | 5 |
| 3 | JOIN Optimization | CRITICAL | `query-join-` | 5 |
| 4 | Insert Batching | CRITICAL | `insert-batch-` | 1 |
| 5 | Mutation Avoidance | CRITICAL | `insert-mutation-` | 2 |
| 6 | Partitioning Strategy | HIGH | `schema-partition-` | 4 |
| 7 | Skipping Indices | HIGH | `query-index-` | 1 |
| 8 | Materialized Views | HIGH | `query-mv-` | 2 |
| 9 | Async Inserts | HIGH | `insert-async-` | 2 |
| 10 | OPTIMIZE Avoidance | HIGH | `insert-optimize-` | 1 |
| 11 | JSON Usage | MEDIUM | `schema-json-` | 1 |

---

## Quick Reference

### Schema Design - Primary Key (CRITICAL)

- `schema-pk-plan-before-creation` - Plan ORDER BY before table creation (immutable)
- `schema-pk-cardinality-order` - Order columns low-to-high cardinality
- `schema-pk-prioritize-filters` - Include frequently filtered columns
- `schema-pk-filter-on-orderby` - Query filters must use ORDER BY prefix

### Schema Design - Data Types (CRITICAL)

- `schema-types-native-types` - Use native types, not String for everything
- `schema-types-minimize-bitwidth` - Use smallest numeric type that fits
- `schema-types-lowcardinality` - LowCardinality for <10K unique strings
- `schema-types-enum` - Enum for finite value sets with validation
- `schema-types-avoid-nullable` - Avoid Nullable; use DEFAULT instead

### Schema Design - Partitioning (HIGH)

- `schema-partition-low-cardinality` - Keep partition count 100-1,000
- `schema-partition-lifecycle` - Use partitioning for data lifecycle, not queries
- `schema-partition-query-tradeoffs` - Understand partition pruning trade-offs
- `schema-partition-start-without` - Consider starting without partitioning

### Schema Design - JSON (MEDIUM)

- `schema-json-when-to-use` - JSON for dynamic schemas; typed columns for known

### Query Optimization - JOINs (CRITICAL)

- `query-join-choose-algorithm` - Select algorithm based on table sizes
- `query-join-use-any` - ANY JOIN when only one match needed
- `query-join-filter-before` - Filter tables before joining
- `query-join-consider-alternatives` - Dictionaries/denormalization vs JOIN
- `query-join-null-handling` - join_use_nulls=0 for default values

### Query Optimization - Indices (HIGH)

- `query-index-skipping-indices` - Skipping indices for non-ORDER BY filters

### Query Optimization - Materialized Views (HIGH)

- `query-mv-incremental` - Incremental MVs for real-time aggregations
- `query-mv-refreshable` - Refreshable MVs for complex joins

### Insert Strategy - Batching (CRITICAL)

- `insert-batch-size` - Batch 10K-100K rows per INSERT

### Insert Strategy - Async (HIGH)

- `insert-async-small-batches` - Async inserts for high-frequency small batches
- `insert-format-native` - Native format for best performance

### Insert Strategy - Mutations (CRITICAL)

- `insert-mutation-avoid-update` - ReplacingMergeTree instead of ALTER UPDATE
- `insert-mutation-avoid-delete` - Lightweight DELETE or DROP PARTITION

### Insert Strategy - Optimization (HIGH)

- `insert-optimize-avoid-final` - Let background merges work

---

## When to Apply

This skill activates when you encounter:

- `CREATE TABLE` statements
- `ALTER TABLE` modifications
- `ORDER BY` or `PRIMARY KEY` discussions
- Data type selection questions
- Slow query troubleshooting
- JOIN optimization requests
- Data ingestion pipeline design
- Update/delete strategy questions
- ReplacingMergeTree or other specialized engine usage
- Partitioning strategy decisions

---

## Rule File Structure

Each rule file in `rules/` contains:

- **YAML frontmatter**: title, impact level, tags
- **Brief explanation**: Why this rule matters
- **Incorrect example**: Anti-pattern with explanation
- **Correct example**: Best practice with explanation
- **Additional context**: Trade-offs, when to apply, references

---

## Full Compiled Document

For the complete guide with all rules expanded inline: `AGENTS.md`

Use `AGENTS.md` when you need to check multiple rules quickly without reading individual files.
