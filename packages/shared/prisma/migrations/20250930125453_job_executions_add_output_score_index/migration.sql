-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "job_executions_project_id_job_output_score_id_idx" ON "job_executions"("project_id", "job_output_score_id");
