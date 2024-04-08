-- CreateIndex
CREATE INDEX CONCURRENTLY "prompts_tags_idx" ON "prompts" USING GIN ("tags" array_ops);
