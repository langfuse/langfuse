# Background Migrations

Background migrations are longer running jobs that must not be complete before a new application version can
be served correctly.
They are used to fill new optional columns, migrate data between tables or systems, or perform other actions
that would take too long to run in a standard migration.
A good threshold is something that takes more than 5 minutes to run or is not an atomic operation.

You can execute a background migration locally using
```bash
$ cd worker
$ dotenv -e ../.env -- npx tsx src/backgroundMigrations/<script-name>.ts

# Example
$ dotenv -e ../.env -- npx tsx src/backgroundMigrations/addGenerationsCostBackfill.ts
```

## Requirements

- The background migration must be recoverable at all times, i.e. it can be interrupted and must be resumed at any stage of the operation.
  We can achieve this by making them either idempotent for cross-system migrations or by making each change atomic if it's in a single database.
- Only one background migration can run at a time. This is not a technical limitation, but makes reasoning about them easier.
- We must highlight in the changelog and potentially another page if the code relies on some background migration having finished. 
  See GitLab's [upgrade stops](https://docs.gitlab.com/ee/update/upgrade_paths.html) for an example on how to communicate this.
- The migration name must be sortable, as we run migrations in order. Preferably, we prefix with a date.
- Background migrations must assume that the worker instance continues processing events while migrations run, i.e. they should avoid the application code.
- Background migrations must assume that new events are being processed while they run, i.e. they should not rely on the state of the database to be static.

## Implementation

We have a `background_migrations` table in the database that stores the state of each migration.
Adding a new background migrations requires a new line within that table and a new migration file in the current directory.
The default export of that file must implement the `IBackgroundMigration` interface and adhere to the requirements above.

The worker will load all background migrations that must run and check whether one of them is pending.
In that case, it will try to acquire a lock and start the execution.
If it completes, it marks the migration as done and proceeds with the next one until all are complete.
If the worker is killed for any reason, another worker will pick up the migration and continue where it left off after the lock expired.

Ideally, background migrations can also be executed via the commandline, e.g. to run them locally or to test them in a staging environment.

## Env-gated migrations (dormant rows)

Some migrations need to ship in release N but only execute in release N+1 (or only when an operator opts in).
The `envGate` mechanism makes a row **dormant**: it sits in `background_migrations` with `finished_at = NULL` but the manager skips it at query time until the named env var is `"true"`.

The gate check lives in the `findFirst` predicate, so a dormant row does **not** head-of-line block later migrations — anything alphabetically after it that is either un-gated or whose gate is on will still run.

### Authoring a gated migration

1. **Pick a gate name** with the `LANGFUSE_BACKGROUND_MIGRATION_` prefix (the manager discovers gates by scanning the validated env for keys with this prefix).
2. **Declare the gate in the row's `args`** in the Prisma migration SQL:
   ```sql
   INSERT INTO background_migrations (id, name, script, args)
   VALUES (
     '...',
     '20260521120000_my_dormant_migration',
     'myDormantMigration',
     '{"projectId": "...", "envGate": "LANGFUSE_BACKGROUND_MIGRATION_V4_ENABLE_MY_FEATURE"}'::jsonb
   );
   ```
3. **Register the env var** in `worker/src/env.ts` `EnvSchema` with `z.enum(["true", "false"]).default("false")` so it is typed, validated at boot, and dormant by default.

When the env var is `"true"` the row becomes visible to the manager and runs in normal name order.
When it is `"false"` (or absent) the row is invisible — no lock, no skip log, no head-of-line block.

## Observation backfill memory regression

Step 3 restricts trace input to `(project_id, trace_id)` keys from the selected
frozen scratch part. This filter precedes trace
`ORDER BY event_ts DESC LIMIT 1 BY project_id, id`. The month boundary, latest
trace-version selection, and `full_sorting_merge` join are retained.
Dataset-run exclusion is evaluated only on source observations. The trace-key
set includes excluded observations' keys: a stable superset that avoids a second
read of the live dataset-run relation determining whether enrichment is available.

With the local schemas migrated and the **root `.env` pointing at disposable
local services**, run:

```sh
pnpm --filter worker run test backfillEventsFullFromObservations.integration.test.ts
```

The test creates private table copies, freezes their merges, and removes them
afterward. Destination copies have the `events_full` schema without its
`events_core` materialized view, isolating the INSERT/join cost. Its factories
fix timestamps to January 2026. One selected part has 14 rows (including
duplicate observation versions and a dataset-run exclusion);
a second part has one unrelated row. The trace input contains unmerged versions,
two projects sharing IDs, and 4,096 unrelated traces with 16 KiB of synthetic
name padding. Tests compare every output column with the original join shape,
both physically and with `FINAL`, and check propagation defaults. Both INSERTs
explicitly use `optimize_on_insert=0` for physical duplicate preservation (two
versions) and separately exercise `optimize_on_insert=1` (one latest version).
With either setting, `FINAL` must return the latest observation version.

The bounded-memory regression reproduces a **query** memory-limit Code 241 in
the original shape at 128 MiB while the filtered query completes. Other failures,
including server-wide memory exhaustion, do not satisfy that assertion. Measured
filtered peaks near 55 MiB and original peaks near 290–325 MiB on 25.12.11.4 and
26.4.5.143 leave headroom on both sides of that threshold; these are fixture
measurements, not universal allocator guarantees. The semantic control queries
allow 512 MiB. Use an otherwise idle local server (3 GiB container memory was
used for the complete runs); query limits do not reserve memory against other
tests or background work. CI must provide sufficient server-wide headroom.

Repeated profiling is **opt-in** and is skipped in the ordinary integration suite:

```sh
LANGFUSE_TEST_BACKFILL_PROFILE=1 pnpm --filter worker run test \
  backfillEventsFullFromObservations.integration.test.ts --silent=false
```

This adds the 1,024-trace fixture and runs each shape three times at a 512 MiB
limit, with two read threads, one insert thread, `optimize_on_insert=0`, and
external sorting disabled. It prints `EXPLAIN PLAN indexes = 1` and query-log
peak memory, read/written rows, duration, and server version. These measurements
are diagnostic: no peak-memory ordering or read-count ratio is asserted.
Only this opt-in test requires permission to flush/read `system.query_log`.

An independent wide-trace prefill is also available through the seed CLI:

```sh
pnpm run seed -- many-traces --count 4096 --days 0 \
  --observations-per-trace 0 --scores-per-trace 0 \
  --trace-name-bytes 16384 --id-prefix backfill-wide
```

This seeds normal trace tables, not the migration scratch table. The integration
test uses private factory fixtures instead because it needs exact source parts,
unmerged versions, and no changes to other tests' merge state. The CLI padding
is capped at 256 MiB total; use a fresh prefix when comparing fixture shapes.

### Scope and limits

On ClickHouse 25.12.11.4 and 26.4.5.143, the original plan already pushes the
observation filter down. The trace-key predicate additionally prunes trace reads
before sorting/deduplication. Both join-side sorts remain. This addresses the
cost of unrelated trace history, **not every cause of migration OOM**: wide or
large selected parts still need sorting, the trace key set grows with the part
(including dataset-run traces), and the dataset-run exclusion set can also be
large. `max_rows_in_set` and `max_bytes_in_set` still apply; neither limit is
raised. Step 3 sets `set_overflow_mode='throw'` for its query so an operator's
`break` profile cannot silently truncate an IN set and omit enrichment. Tests
isolate the trace-key set with an empty exclusion relation and verify both row
and byte overflow raise Code 191 (`SET_SIZE_LIMIT_EXCEEDED`); the unguarded
control succeeds with missing trace properties. This is fail-closed error
handling, not a promise of transactional INSERT rollback.

The extra narrow scratch read trades some I/O and set memory for less trace
sorting. Small local fixtures
do not establish a production memory bound or validate SharedMergeTree replica
behavior; the existing merge freeze, convergence and part-integrity checks still
apply.
