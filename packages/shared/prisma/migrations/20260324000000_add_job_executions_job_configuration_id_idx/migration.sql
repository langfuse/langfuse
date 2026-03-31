-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "job_executions_job_configuration_id_idx" ON "job_executions"("job_configuration_id");
