-- CreateIndex
CREATE INDEX CONCURRENTLY "observation_media_project_id_media_id_idx" ON "observation_media"("project_id", "media_id");
