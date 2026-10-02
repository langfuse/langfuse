# Topics tables

Topics Postgres storage uses normal Prisma migrations. Facets and saved rules
reuse the evaluator/version and evaluation-rule/assignment tables;
`topic_clustering_runs` is the only new Postgres table.

This provisioner creates the three Topics ClickHouse tables explicitly, outside
the normal ClickHouse migrations. Keep `LANGFUSE_TOPICS_ENABLED=false` (the
default) on deployments without these tables.

## Staging / one production region

From an installed checkout (`pnpm install`), copy
[remote.env.example](./remote.env.example) to a private file outside the repo.
Fill in that deployment's **ClickHouse HTTP URL**, credentials and database name.
`CLICKHOUSE_URL` must be the server origin, without a database path or query
parameters. Apply normal Langfuse migrations, including Postgres, before enabling
Topics. Use a machine with network access and ClickHouse DDL permissions.

```bash
# Read-only: prints the target, checks existing schemas, lists missing tables.
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
the actual deployment. No native ClickHouse client required.

## Local development

Use an initialized local stack: installed dependencies, generated Prisma client
and shared build, baseline Postgres/ClickHouse migrations including v4 events
tables, and the seeded demo project. Check datastore readiness with
`pnpm run seed -- doctor`, then run:

```bash
pnpm run topics:dev-setup
pnpm run dev
```

The convenience setup creates missing Topics ClickHouse tables and seeds only the
[Topics discovery/assignment fixture](../seeder/README.md#topics). Normal stack
setup owns migrations, generated clients, builds and demo project seeding.
Apply the runtime flags above on web and worker; for demo data, allow project
`7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`.

For ClickHouse tables only: `pnpm run topics:dev-tables --apply`. The optional
`clickhouse` positional argument selects the same target. Without `--config`, the
root `.env` is loaded and exported variables take precedence. ClickHouse uses `CLICKHOUSE_URL`
(HTTP/HTTPS), `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` and `CLICKHOUSE_DB` (default
`default` locally). It does not use the native `CLICKHOUSE_MIGRATION_URL`.

Postgres setup, including `topic_clustering_runs`, belongs to normal `db:deploy`,
`db:reset` and `db:reset:test` commands. `ch:reset` explicitly drops Topics
ClickHouse tables after the normal confirmed down-migration step, including
incompatible schemas and existing rows, then recreates them. CI applies normal
migrations and runs this ClickHouse provisioner explicitly. Production
entrypoints never run the ClickHouse provisioner automatically.

## Safety and schema changes

- All three ClickHouse tables are checked before any DDL. Columns,
  expressions, constraints, replacement engine/version and keys must match.
  ClickHouse storage settings may differ except the required projection
  maintenance settings.
- Missing tables are created. Existing incompatible tables cause failure; no
  automatic ALTER, DROP, data deletion, seeding or migration-history edits.
- ClickHouse can be partially provisioned after a failure. Fix the cause and
  rerun preflight/apply. A rerun verifies all tables, including previously
  created ones.
- Changing these CREATE statements does not upgrade existing databases. Plan
  explicit schema upgrades separately. Do not reset a database containing data
  that must survive.

ClickHouse DDL lives in `clickhouse.sql`. The canonical Topics ClickHouse
migration 0050 has a `.sql.disabled` suffix. Clean any previously materialized ClickHouse migration trees
with `pnpm --filter @langfuse/shared run ch:migrations:clean`.
This script does not change Postgres, erase migration history or force migration
versions.

Definitions partition by creation month and sort by project, creation date and ID.
Summaries and assignments partition by source month and share the project,
source minute, facet/version and source identity prefix. Assignment keys retain
run and origin suffixes so online processing and unpublished runs preserve the
published map's original cohort. Processing and assignment timestamps only
select replacement versions. Reads require explicit time bounds, per ClickHouse
`schema-pk-filter-on-orderby` and `schema-partition-lifecycle`.

Summaries also have a compact source-key projection. Payload reads remain
time-bounded; metadata lookups for candidate source IDs include all dates so a
newer result outside the selected window invalidates its earlier location.
Projection rebuild settings preserve this lookup during replacement merges and
lightweight deletion.
