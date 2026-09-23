# Topics development tables

The setup script creates the five Topics Postgres tables and three ClickHouse
tables independently of the migration files. Apply the normal migrations first,
then run from the repository root:

```bash
pnpm --filter @langfuse/shared run topics:dev-tables
```

After provisioning, set `LANGFUSE_TOPICS_ENABLED=true` on web and worker, plus
`LANGFUSE_TOPICS_ENABLED_PROJECT_IDS` for projects allowed to process. Both are
disabled/empty by default. Keep enablement true for historical cleanup when
clearing the project list to pause processing. Deployments without the tables
must leave `LANGFUSE_TOPICS_ENABLED` unset or false.

Pass `postgres` or `clickhouse` to set up only that database. The command loads
the root `.env`; exported variables take precedence. Postgres uses Prisma's
`DIRECT_URL` (falling back to `DATABASE_URL`), and ClickHouse uses
`CLICKHOUSE_MIGRATION_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD`,
`CLICKHOUSE_DB` (default `default`) and optional `CLICKHOUSE_MIGRATION_SSL`.
The native `clickhouse` client must be installed for ClickHouse setup. No `psql`
client is needed. Both databases must already exist, and Postgres needs the base
`projects` table.

To target the test Postgres database, run from `packages/shared`:

```bash
pnpm exec dotenv -e ../../.env.test -e ../../.env -- bash scripts/topics-dev-tables.sh postgres
```

Verify that both `DATABASE_URL` and `DIRECT_URL` point to the intended database
when overriding configuration. The script does not create databases, seed data,
drop tables, or change migration history. Postgres DDL is transactional;
ClickHouse DDL is sequential and can be retried after a partial failure.

`CREATE TABLE IF NOT EXISTS` supports fresh databases and reruns against the
current schema. It does **not** repair older Topics schemas. In particular, older
`topic_facets` names or obsolete columns/keys need a deliberate upgrade or a
disposable database reset. Keep future schema changes explicit with idempotent
ALTER statements; editing a CREATE statement alone does not update an existing
table. The ClickHouse SQL uses single-node `ReplacingMergeTree` tables, matching
the unclustered migration. It is not a replicated production provisioning path.

## Migration cutover checklist

The Topics migrations are disabled. The Postgres migration is archived under
`prisma/migrations-disabled/20260916000000_add_topics/migration.sql`, outside
Prisma's migration discovery. The ClickHouse files are retained as
`clickhouse/migrations/canonical/0050_add_topics.{up,down}.sql.disabled`, which
the renderer ignores. Existing reset/CI/deployment commands are unchanged.

1. Keep the Topics models and relations in `prisma/schema.prisma` for generated
   types. Clean or regenerate any materialized ClickHouse migration trees after
   switching to the disabled migration files.
2. Provision the script after baseline migrations for **both** local Postgres
   databases and ClickHouse. `dx`, `dx-f` and `dx:skip-infra` reset dev and test
   Postgres; `ch:reset` resets only ClickHouse. None currently calls this script.
   Avoid invoking the existing `ch:dev-tables` just to create Topics tables: that
   script also truncates and reseeds event tables.
3. Update CI provisioning in `.github/workflows/pipeline.yml`. Its web/worker
   jobs use `db:migrate` (`prisma migrate dev`), which will detect the retained
   Topics models as an unapplied schema change or report drift. Use the baseline
   `db:deploy` path followed by this script for disposable test environments.
   Provision Topics in both clustered and unclustered test jobs; the existing
   `ch:dev-tables` step only runs in the unclustered jobs. Single-node tables can
   serve local tests, but replicated deployment requires separate provisioning.
4. Decide how developers generate future Prisma migrations: with Topics models
   outside migration history, `prisma migrate dev` cannot reconstruct the schema
   in its shadow database. A separate schema for migration generation, or an
   explicit experimental-schema workflow, is needed to avoid regenerating the
   Topics migration. Running this setup alone does not solve drift.
5. Reconcile already-applied migration history before using this checkout with
   an existing environment. ClickHouse may still record version 50; Prisma may
   record the disabled migration. Prefer rebuilding disposable databases from
   the remaining baseline. Do not blindly force migration versions or erase
   history in databases whose data must be retained.
6. Cover previews and deployments, whose entrypoints only apply normal
   migrations. Provision Topics storage before setting `LANGFUSE_TOPICS_ENABLED=true`
   on web and worker. Keep it unset or false wherever the tables are absent;
   Topics routes, queues, UI availability and cleanup then stay disabled.

The schema is copied from the current migrations, including tenant-scoped
foreign keys, source-presence constraints, replacement versions and ordering.
Per the ClickHouse `schema-pk-plan-before-creation` and
`schema-pk-prioritize-filters` rules, changing those keys is separate from moving
the DDL into a development setup script.
