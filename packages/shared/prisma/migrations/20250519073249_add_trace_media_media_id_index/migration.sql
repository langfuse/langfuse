-- CreateIndex
CREATE INDEX CONCURRENTLY "trace_media_project_id_media_id_idx" ON "trace_media"("project_id", "media_id");
