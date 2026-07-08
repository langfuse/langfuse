-- CreateIndex
CREATE INDEX CONCURRENTLY "observations_trace_id_project_id_start_time_idx" ON "observations"("trace_id", "project_id", "start_time");
