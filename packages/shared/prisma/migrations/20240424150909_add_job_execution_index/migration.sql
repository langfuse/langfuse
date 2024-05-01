-- CreateIndex
CREATE INDEX "job_executions_project_id_status_idx" ON "job_executions"("project_id", "status");
