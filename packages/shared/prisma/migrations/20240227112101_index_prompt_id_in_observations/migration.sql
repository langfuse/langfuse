-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "observations_prompt_id_idx" ON "observations"("prompt_id");
