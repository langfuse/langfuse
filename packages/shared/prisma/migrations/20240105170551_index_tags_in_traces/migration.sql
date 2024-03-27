-- CreateIndex
CREATE INDEX "traces_tags_idx" ON "traces" USING GIN ("tags" array_ops);
