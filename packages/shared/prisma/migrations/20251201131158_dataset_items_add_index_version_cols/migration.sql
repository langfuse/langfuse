-- CreateIndex
CREATE INDEX CONCURRENTLY "dataset_items_project_id_dataset_id_id_valid_from_idx" ON "dataset_items"("project_id", "dataset_id", "id", "valid_from");
