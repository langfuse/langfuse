-- CreateIndex
CREATE INDEX CONCURRENTLY "observations_project_id_prompt_id_idx" ON "observations"("project_id", "prompt_id");
