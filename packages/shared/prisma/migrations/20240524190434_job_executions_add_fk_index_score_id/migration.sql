-- CreateIndex
CREATE INDEX CONCURRENTLY "job_executions_job_output_score_id_idx" ON "job_executions"("job_output_score_id");
