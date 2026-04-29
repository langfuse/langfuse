---
title: Use SETTINGS alter_sync = 2 / mutations_sync = 2 for back-to-back ALTERs in a single migration
impact: HIGH
impactDescription: "Prevents CANNOT_ASSIGN_ALTER (517) failures on ReplicatedMergeTree / SharedMergeTree (ClickHouse Cloud) when a migration file contains more than one ALTER on the same table"
tags: [migration, ALTER, replicated, SharedMergeTree, alter_sync, mutations_sync]
---

## Use `SETTINGS alter_sync = 2` (or `mutations_sync = 2`) for back-to-back ALTERs in a single migration

**Impact: HIGH**

On replicated table engines — `ReplicatedMergeTree` and ClickHouse Cloud's
`SharedMergeTree` — `ALTER` statements bump a per-table metadata version that
is propagated through Keeper. The default `alter_sync = 1` (and Cloud's
default of `0`) only waits for the *local* replica to apply the change. When a
migration file issues a second `ALTER` against the same table immediately
after the first, that second `ALTER` can be routed to a replica whose
metadata version still lags the cluster's "common metadata" version, and
ClickHouse rejects it with:

```
Code: 517. CANNOT_ASSIGN_ALTER. Looks like this replica doesn't catchup with
latest ALTER query updates: metadata version on replica is N, while common
metadata is N+1. Please retry this query.
```

This has bitten Langfuse self-hosters running on ClickHouse Cloud during
initial bootstrap (see migrations 0005, 0006, 0008, 0025, 0026, 0031). The
per-statement `SETTINGS` block in the migration file is the source of truth.

A single `ALTER` per migration file is acceptable and does not need the
setting — the issue is specifically the cross-statement metadata-version race.

### Pick the right setting per statement

`alter_sync` only governs `ALTER` queries that modify metadata. Some `ALTER`
subtypes are implemented as **mutations** instead, and their synchronicity is
controlled by `mutations_sync`.

| Statement | Type | Setting |
| --- | --- | --- |
| `ADD COLUMN`, `DROP COLUMN`, `MODIFY COLUMN` | metadata | `SETTINGS alter_sync = 2` |
| `ADD INDEX`, `DROP INDEX` | metadata | `SETTINGS alter_sync = 2` |
| `MATERIALIZE INDEX`, `MATERIALIZE COLUMN`, `MATERIALIZE PROJECTION`, `CLEAR INDEX` | mutation | `SETTINGS mutations_sync = 2` |
| `UPDATE`, `DELETE` | mutation | `SETTINGS mutations_sync = 2` |

Using `alter_sync` on a mutation statement is silently a no-op on that
statement, but the setting on the *preceding* metadata `ALTER` is what
prevents the 517 race at the next statement's submission. The
`mutations_sync = 2` on the mutation itself additionally waits for
materialization to complete on all replicas before the migration returns —
usually what you want, otherwise queries running right after the migration
hit unmaterialized parts.

### Scope: clustered migrations only

`alter_sync` and `mutations_sync` are "applicable to `Replicated` and
`SharedMergeTree` tables only" per the ClickHouse docs — they do nothing on
plain `MergeTree`. Apply this rule **only** to files under
`packages/shared/clickhouse/migrations/clustered/`. The corresponding
`unclustered/` files run against non-replicated `MergeTree` and do not need
(and should not duplicate) these settings.

### Examples

**Incorrect (back-to-back ALTERs without sync settings):**

```sql
-- 0031_add_usage_pricing_tier_columns.up.sql (BEFORE FIX)
ALTER TABLE observations ON CLUSTER default ADD COLUMN usage_pricing_tier_id Nullable(String);
ALTER TABLE observations ON CLUSTER default ADD COLUMN usage_pricing_tier_name Nullable(String);
-- ^ second ALTER intermittently fails with code 517 on Replicated/SharedMergeTree
```

**Correct — all metadata ALTERs (`alter_sync = 2`):**

```sql
-- 0033_add_tool_call_columns.up.sql
ALTER TABLE observations ON CLUSTER default
  ADD COLUMN IF NOT EXISTS tool_definitions Map(String, String) DEFAULT map()
  SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default
  ADD COLUMN IF NOT EXISTS tool_calls Array(String) DEFAULT []
  SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default
  ADD COLUMN IF NOT EXISTS tool_call_names Array(String) DEFAULT []
  SETTINGS alter_sync = 2;
```

**Correct — mixed metadata + mutation:**

```sql
-- 0006_add_user_id_index.up.sql
ALTER TABLE traces ON CLUSTER default
  ADD INDEX IF NOT EXISTS idx_user_id user_id TYPE bloom_filter() GRANULARITY 1
  SETTINGS alter_sync = 2;        -- metadata: wait for all replicas
ALTER TABLE traces ON CLUSTER default
  MATERIALIZE INDEX IF EXISTS idx_user_id
  SETTINGS mutations_sync = 2;    -- mutation: wait for materialization
```

Apply the same settings to corresponding `.down.sql` files when they also
contain multiple ALTERs — recovery and rollback must be reliable too.

### Checklist for any new clustered migration

- [ ] If the file contains more than one `ALTER`, every metadata `ALTER`
      ends with `SETTINGS alter_sync = 2` and every mutation-creating
      `ALTER` (`MATERIALIZE …`, `UPDATE`, `DELETE`) ends with
      `SETTINGS mutations_sync = 2`.
- [ ] The file lives under `clustered/`. The matching `unclustered/` file
      does not carry these settings.
- [ ] The `.down.sql` mirrors the `.up.sql` settings when it also contains
      multiple ALTERs.

References:
- [ClickHouse `alter_sync` setting](https://clickhouse.com/docs/operations/settings/settings#alter_sync)
- [ClickHouse `mutations_sync` setting](https://clickhouse.com/docs/operations/settings/settings#mutations_sync)
- [ClickHouse ALTER overview (mutation vs metadata)](https://clickhouse.com/docs/sql-reference/statements/alter/index)
- [ClickHouse ALTER … INDEX (`MATERIALIZE INDEX` is a mutation)](https://clickhouse.com/docs/sql-reference/statements/alter/skipping-index)
