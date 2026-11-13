# CockroachDB

Langfuse can use CockroachDB instead of PostgreSQL as its transactional database. This support is experimental. PostgreSQL stays the default and the main target. ClickHouse, Redis and blob storage are not affected.

## Supported versions

CI applies the migrations to CockroachDB v26.2 (the `cockroachdb-migrations` job in `.github/workflows/pipeline.yml`). Other versions are not tested.

## Setup

1. Point `DATABASE_URL` (and `DIRECT_URL`, if you set it) at the CockroachDB database. Keep the `postgresql://` scheme.
2. Set `LANGFUSE_POSTGRES_ENGINE=cockroachdb` on the web and the worker containers. The web container then applies the migrations with `migrate.sh` at startup, and both containers use the CockroachDB variant of the few queries that differ.
3. Make READ COMMITTED the default isolation level for the role Langfuse connects as. Langfuse is written for PostgreSQL's default, READ COMMITTED. Under CockroachDB's default, SERIALIZABLE, conflicting writes fail with a retryable error (SQLSTATE `40001`) instead of waiting, and most code paths do not retry them.

   ```sql
   SET CLUSTER SETTING sql.txn.read_committed_isolation.enabled = true;
   ALTER ROLE langfuse SET default_transaction_isolation = 'read committed';
   ```

   The cluster setting is `true` by default. When it is `false`, CockroachDB runs READ COMMITTED transactions as SERIALIZABLE.

An existing PostgreSQL installation cannot be switched to CockroachDB: there is no data migration path. Start with an empty CockroachDB database.

## Migrations

`migrate.sh` runs a `prisma migrate` command (default `deploy`) on the migrations in `../migrations`, with the files in `overrides/` in place of the migrations that CockroachDB rejects. The script header explains the session settings it uses.

- **Not atomic.** A migration that fails halfway keeps its earlier statements. Undo or finish them by hand, then mark the migration with `sh migrate.sh resolve --rolled-back <migration>` (or `--applied`) and start again.
- **One runner at a time.** Prisma takes no lock against concurrent runs on CockroachDB. A second runner usually stops with P3009 on the first runner's unfinished migration, and its container restarts; if both read the history between two migrations, both can apply the same one and leave it failed. With several web replicas, let one apply the migrations and set `LANGFUSE_AUTO_POSTGRES_MIGRATION_DISABLED=true` on the others.
- **Writable temporary folder.** The script assembles the migrations in `TMPDIR` (default `/tmp`). A container with a read-only root file system needs a writable volume there.

For contributors: a new migration that CockroachDB rejects needs an override folder with the same name. A released override never changes, because installations that already applied it keep the old SQL; correct it with a new migration.

## Known differences

- **JSON columns keep no key order.** `JSON` is an alias of `JSONB` on CockroachDB, so prompt configs, LLM tool definitions and dataset JSON schemas are stored with sorted keys and without duplicate keys.
- **Regular expressions.** Custom model match patterns run on CockroachDB's regular expression engine, which differs from PostgreSQL's. Patterns are checked against the database when they are saved.
- **`media` has a primary key on `(project_id, id)`.** PostgreSQL has only a unique index on these columns.
- **Legacy role assignment columns are computed.** See the header of `overrides/20261008120000_reshape_role_assignments/migration.sql`.

## Not supported

- `db:migrate`, `db:reset` and the test suites' database setup. They call `prisma migrate` with the PostgreSQL provider, which refuses CockroachDB. Use `pnpm --filter @langfuse/shared run db:deploy:cockroachdb` to apply migrations in development.
