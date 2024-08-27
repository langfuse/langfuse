-- CreateIndex
CREATE INDEX CONCURRENTLY "job_executions_job_input_trace_id_idx" ON "job_executions"("job_input_trace_id");
