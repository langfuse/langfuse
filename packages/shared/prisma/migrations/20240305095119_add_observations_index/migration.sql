-- CreateIndex
CREATE INDEX CONCURRENTLY "observations_trace_id_project_id_idx" ON "observations"("trace_id", "project_id");
