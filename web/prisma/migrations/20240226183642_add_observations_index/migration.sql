-- CreateIndex
CREATE INDEX CONCURRENTLY "observations_project_id_internal_model_start_time_unit_idx" ON "observations"("project_id", "internal_model", "start_time", "unit");
