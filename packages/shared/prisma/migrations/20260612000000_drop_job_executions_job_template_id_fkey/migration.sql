-- DropForeignKey
-- Warning: this metadata-only change still needs an ACCESS EXCLUSIVE lock on
-- job_executions. Run with blocker monitoring and cancel/retry if lock
-- acquisition would queue behind long-running transactions.
SET lock_timeout = '5s';
SET statement_timeout = '5s';
ALTER TABLE "job_executions" DROP CONSTRAINT IF EXISTS "job_executions_job_template_id_fkey";
RESET statement_timeout;
RESET lock_timeout;
