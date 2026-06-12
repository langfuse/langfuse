-- CreateIndex
-- Required so the FK's ON DELETE SET NULL on job_executions.job_template_id
-- does not seq-scan the table when an eval template is deleted.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "job_executions_job_template_id_idx" ON "job_executions"("job_template_id");
