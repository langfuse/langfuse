-- Prisma does not automatically wrap PostgreSQL migrations in a transaction.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "job_executions"
  DROP CONSTRAINT IF EXISTS "job_executions_job_configuration_id_fkey";

COMMIT;
