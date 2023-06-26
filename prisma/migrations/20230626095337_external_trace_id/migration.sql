ALTER TABLE "traces" ADD COLUMN     "external_id" TEXT;
CREATE UNIQUE INDEX "traces_project_id_external_id_key" ON "traces"("project_id", "external_id");
