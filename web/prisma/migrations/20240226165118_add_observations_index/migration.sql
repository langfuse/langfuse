-- CreateIndex
CREATE INDEX "observations_project_id_start_time_type_idx" ON "observations"("project_id", "start_time", "type");
