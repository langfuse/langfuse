-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trace_media_project_id_media_id_idx" ON "trace_media"("project_id", "media_id");
