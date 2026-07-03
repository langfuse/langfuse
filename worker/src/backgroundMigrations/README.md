# Background Migrations

Background migrations are longer running jobs that must not be complete before a new application version can
be served correctly.
They are used to fill new optional columns, migrate data between tables or systems, or perform other actions
that would take too long to run in a standard migration.
A good threshold is something that takes more than 5 minutes to run or is not an atomic operation.

You can execute a background migration locally using
```bash
$ cd worker
$ dotenv -e ../.env -- npx ts-node src/backgroundMigrations/<script-name>.ts

# Example
$ dotenv -e ../.env -- npx ts-node src/backgroundMigrations/addGenerationsCostBackfill.ts
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
