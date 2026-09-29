# ClickHouse migrations

`canonical/` is the only authored migration-template directory. Do not add a
second source copy. `clickhouse/scripts/prepare-migrations.mjs` renders the SQL
consumed by `golang-migrate`.

The production web image contains generated `clustered/` and `unclustered/`
directories next to `canonical/`. They are the primary migration inputs for
default-cluster and unclustered deployments and preserve documented recovery
commands that run `golang-migrate` directly inside the container. A custom
cluster name is rendered from `canonical/` into a temporary directory at
runtime. Source checkouts contain only `canonical/`, so the migration scripts
render a temporary directory for every mode during local development.

Do not edit or treat the generated `clustered/` and `unclustered/` directories
as migration sources. Migrations 0001-0047 render byte-for-byte identically to
the files shipped before the canonical template was introduced.

Use these explicit placeholders:

- `{CLICKHOUSE_CLUSTER_CLAUSE}` at every cluster-aware DDL position. It renders
  as `ON CLUSTER default`, a safely quoted custom cluster name, or an empty
  string for unclustered deployments.
- `{CLICKHOUSE_REPLICATION_PREFIX}` only on engines that should render as
  `Replicated*MergeTree` in clustered mode and `*MergeTree` in unclustered
  mode. Some tables intentionally remain non-replicated in both modes.
- `{CLICKHOUSE_CLUSTERED_ONLY:...}` for settings required only by replicated
  migrations, such as `alter_sync = 2` and `mutations_sync = 2`.
- `{CLICKHOUSE_UNCLUSTERED_ONLY:...}` only for an intentional mode-specific
  difference. Existing uses preserve historical migration behavior.
- `{CLICKHOUSE_HISTORICAL_FINAL_NEWLINES:...}` only in already-shipped
  migrations whose clustered and unclustered files had unusual end-of-file
  newlines. Do not use it in new migrations.

Keep migration version numbers and filenames stable. Do not retrofit
synchronization settings or formatting into already-shipped
migrations merely for consistency. Their rendered output is compatibility
history and should change only as a deliberate forward fix.

After changing a migration or the renderer, run:

```sh
pnpm --filter @langfuse/shared run test prepareMigrations.test.ts
```

The test invokes the production scripts through POSIX `sh`, checks both modes,
and locks the exact historical bytes for both generated migration trees.

## Direct migrations from a source checkout

Source checkouts do not contain the generated `clustered/` and `unclustered/`
trees. Materialize them before using a direct `golang-migrate` command from an
operations runbook:

```sh
pnpm ch:migrations:materialize
migrate -source file://packages/shared/clickhouse/migrations/unclustered -database "<migration-url>" up
pnpm ch:migrations:clean
```

Always run the clean command after the migration, including after a failed
migration. Do not edit the materialized files. They are intentionally not
ignored by Git so an incomplete cleanup or stale generated tree remains visible
in `git status`.

## Helm chart with a custom cluster name

The ClickHouse cluster bundled with the current Helm chart uses the name
`default`; it requires no additional configuration.

| ClickHouse deployment                             | Helm setting                                         | Migration input                  |
| ------------------------------------------------- | ---------------------------------------------------- | -------------------------------- |
| Chart-managed or external cluster named `default` | `clickhouse.cluster.enabled: true`                   | Delivered `clustered/`           |
| External, non-clustered server                    | `clickhouse.cluster.enabled: false`                  | Delivered `unclustered/`         |
| External cluster with another name                | Enable the cluster and set `CLICKHOUSE_CLUSTER_NAME` | Runtime render from `canonical/` |

For an external ClickHouse cluster with another name, enable clustered
migrations and pass the raw cluster name to both Langfuse containers through
the chart's global `additionalEnv`:

```yaml
clickhouse:
  deploy: false
  host: clickhouse.example.internal
  cluster:
    enabled: true
  migration:
    autoMigrate: true

langfuse:
  additionalEnv:
    - name: CLICKHOUSE_CLUSTER_NAME
      value: "virtual-cluster"
```

Do not add SQL quotes around `virtual-cluster`; the migration renderer quotes
and URL-encodes the value. Configure the remaining ClickHouse host, ports,
database, user, password, and TLS values through the chart as usual. On web
startup, Langfuse renders the custom-cluster migration tree and applies it
automatically. The same global environment variable reaches the worker for
runtime queries.
