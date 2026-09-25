# Topics tables

Topics storage is provisioned explicitly. Normal production migrations do not
create it. Keep `LANGFUSE_TOPICS_ENABLED=false` (the default) on deployments
without these tables.

## Staging / one production region

From an installed checkout (`pnpm install`, generated Prisma client), copy
[remote.env.example](./remote.env.example) to a private file outside the repo.
Fill in that deployment's **direct Postgres URL** and **ClickHouse HTTP URL**,
credentials and database name. `CLICKHOUSE_URL` must be the server origin, without
a database path or query parameters. The databases and normal Langfuse migrations must
already exist. Use a machine with network access and DDL permissions.

```bash
# Read-only: prints targets, checks existing schemas, lists missing tables.
pnpm run topics:dev-tables --config /absolute/path/staging.env

# Same preflight, then create missing tables and verify the resulting schemas.
pnpm run topics:dev-tables --config /absolute/path/staging.env --apply
```

An explicit env file supplies all connection settings; no fallback to exported
variables or the local `.env`. Relative paths resolve from the repository root.
The option is named `--config` because Node can consume `--env-file` before this
script starts.
No shell evaluation or variable interpolation inside the file. Target summaries
omit credentials. `--check` is an explicit spelling of the default mode.

Once provisioning succeeds, set on **both web and worker in that deployment**:

```dotenv
LANGFUSE_TOPICS_ENABLED=true
LANGFUSE_TOPICS_ENABLED_PROJECT_IDS=<allowed-project-ids>
```

Restart/redeploy those services. Other deployments stay disabled. Clearing the
project list pauses processing; keep the global flag enabled while retaining
Topics data so historical cleanup can still run.

Supported: single-node ClickHouse and ClickHouse Cloud's managed SharedMergeTree
replication. Self-managed `CLICKHOUSE_CLUSTER_ENABLED=true` is rejected before
DDL; it needs a separate, cluster-aware provisioning path. Cloud compatibility
is accounted for in schema checks, but provisioning must still be checked against
the actual deployment. No native ClickHouse or PostgreSQL client required.

## Local development

Use an initialized local stack: installed dependencies, generated Prisma client
and shared build, baseline Postgres/ClickHouse migrations including v4 events
tables, and the seeded demo project. Check datastore readiness with
`pnpm run seed -- doctor`, then run:

```bash
pnpm run topics:dev-setup
pnpm run dev
```

The convenience setup creates missing Topics tables and seeds only the
[Topics discovery/assignment fixture](../seeder/README.md#topics). Normal stack
setup owns migrations, generated clients, builds and demo project seeding.
Apply the runtime flags above on web and worker; for demo data, allow project
`7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`.

For tables only: `pnpm run topics:dev-tables --apply`. Without `--config`, the
root `.env` is loaded and exported variables take precedence. `DIRECT_URL` wins
over `DATABASE_URL`; check both when overriding. ClickHouse uses `CLICKHOUSE_URL`
(HTTP/HTTPS), `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` and `CLICKHOUSE_DB` (default
`default` locally). It does not use the native `CLICKHOUSE_MIGRATION_URL`.

Pass `postgres` or `clickhouse` to select one database. For test Postgres:

```bash
pnpm --filter @langfuse/shared exec dotenv -e ../../.env.test -e ../../.env -- pnpm run topics:dev-tables postgres --apply
```

The existing `db:reset`, `db:reset:test`, and `ch:reset` now provision their Topics
tables too. `ch:reset` explicitly drops Topics tables after the normal confirmed
down-migration step, including incompatible schemas and existing rows. CI applies baseline migrations with `db:deploy`, then runs this
provisioner explicitly. Production entrypoints never run it automatically.

## Safety and schema changes

- Both selected databases are checked before any DDL. PostgreSQL columns,
  defaults, constraints and required indexes must match; ClickHouse columns,
  expressions, constraints, replacement engine/version and keys must match.
  ClickHouse storage settings are allowed to differ.
- Missing tables are created. Existing incompatible tables cause failure; no
  automatic ALTER, DROP, data deletion, seeding or migration-history edits.
- PostgreSQL DDL is transactional. Cross-database provisioning is not atomic;
  ClickHouse can be partially provisioned after a failure. Fix the cause and
  rerun preflight/apply. A rerun verifies all tables, including previously
  created ones.
- Changing these CREATE statements does not upgrade existing databases. Plan
  explicit schema upgrades separately. Do not reset a database containing data
  that must survive.

`prisma.config.ts` marks the five Topics tables as externally managed using
Prisma's experimental `externalTables` support. The full Prisma schema still
supplies client types; future `migrate dev` / `db push` leave Topics alone.
Postgres DDL lives in `postgres.sql`, ClickHouse DDL in `clickhouse.sql`.

The former Postgres migration is archived under `prisma/migrations-disabled/`;
ClickHouse migration 0050 has a `.sql.disabled` suffix. Ship those file renames
with this change. Clean any previously materialized ClickHouse migration trees
with `pnpm --filter @langfuse/shared run ch:migrations:clean`.
Already-applied Topics migration history needs deliberate reconciliation before
using development migration/reset tools on retained databases. This script does
not erase history or force migration versions.

Ordering, partitioning and replacement identity are unchanged, per ClickHouse
`schema-pk-plan-before-creation` and `schema-pk-prioritize-filters`.
