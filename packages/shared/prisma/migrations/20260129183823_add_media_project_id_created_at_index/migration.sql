-- CreateIndex
CREATE INDEX CONCURRENTLY "media_project_id_created_at_idx" ON "media"("project_id", "created_at");
