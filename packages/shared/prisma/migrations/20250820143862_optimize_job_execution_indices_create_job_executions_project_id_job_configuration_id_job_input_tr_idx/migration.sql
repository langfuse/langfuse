-- CreateIndex
CREATE INDEX CONCURRENTLY "job_executions_project_id_job_configuration_id_job_input_tr_idx" ON "job_executions"("project_id", "job_configuration_id", "job_input_trace_id");
