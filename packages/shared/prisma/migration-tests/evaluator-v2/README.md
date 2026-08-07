# Evaluator v2 migration suite

This manual Vitest suite creates an isolated database on the PostgreSQL server configured by the repository's `.env`, applies the repository's migrations up to the evaluator migration, loads legacy data, and continues with normal `prisma migrate deploy`. Vitest then checks the migrated records and tenant isolation. Its setup runs deploy a second time and verifies that Prisma reports no pending migrations, and its teardown drops the database. It requires at least two project IDs so tenant isolation is always exercised. It is intentionally outside the regular test discovery paths and is not part of CI.

Run with checked-in fixtures:

```bash
pnpm --filter @langfuse/shared run db:test:evaluator-v2-migration
```

The configured PostgreSQL user must be allowed to create and drop databases. For the standard local setup, the existing Docker Compose PostgreSQL service already provides these permissions; the suite connects through its normal host and credentials without invoking Docker.

To test an approved production dump, restore the selected `eval_templates` and `job_configurations` data yourself into a disposable database whose schema is migrated up to, but not including, `20260807120000_drop_job_execution_configuration_fk`. Then point the suite at it:

```bash
EVALUATOR_V2_MIGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evaluator_dump_test \
  pnpm --filter @langfuse/shared run db:test:evaluator-v2-migration
```

The suite creates minimal synthetic organization and project records needed by the target foreign keys, applies the remaining migrations, and runs dump-safe invariants rather than fixture-specific assertions. Existing-database mode intentionally does not create or drop the supplied database.
