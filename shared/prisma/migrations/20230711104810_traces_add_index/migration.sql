-- DropIndex
DROP INDEX "traces_project_id_name_user_id_idx";

-- CreateIndex
CREATE INDEX "traces_project_id_name_user_id_external_id_idx" ON "traces"("project_id", "name", "user_id", "external_id");
