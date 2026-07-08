-- Index cannot be created concurrently in a transaction, so we need to create it separately
-- Prerequisite for migration 20250518075613_media_relax_id_uniqueness_to_project_only
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "media_project_id_id_key" ON "media"("project_id", "id");
