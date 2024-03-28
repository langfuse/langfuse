/*
  Warnings:

  - A unique constraint covering the columns `[project_id,model_name,start_date,unit]` on the table `models` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "models_project_id_model_name_idx" ON "models"("project_id", "model_name");

-- CreateIndex
CREATE UNIQUE INDEX "models_project_id_model_name_start_date_unit_key" ON "models"("project_id", "model_name", "start_date", "unit");
