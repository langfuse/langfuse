-- CreateIndex
CREATE INDEX CONCURRENTLY "observations_trace_id_project_id_type_start_time_idx" ON "observations"("trace_id", "project_id", "type", "start_time");