-- CreateIndex
CREATE INDEX CONCURRENTLY "models_project_id_model_name_start_date_unit_idx" ON "models"("project_id", "model_name", "start_date", "unit");
