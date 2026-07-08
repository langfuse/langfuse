-- CreateIndex
CREATE INDEX "prompts_project_id_id_idx" ON "prompts"("project_id", "id");

-- CreateIndex
CREATE INDEX "prompts_project_id_idx" ON "prompts"("project_id");
