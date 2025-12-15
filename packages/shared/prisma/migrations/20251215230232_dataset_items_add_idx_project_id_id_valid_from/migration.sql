-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dataset_items_project_id_id_valid_from_idx" ON "dataset_items"("project_id", "id", "valid_from");