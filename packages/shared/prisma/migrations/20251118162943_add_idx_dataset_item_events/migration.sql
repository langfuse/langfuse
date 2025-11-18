-- CreateIndex
CREATE INDEX "dataset_item_events_project_id_dataset_id_id_created_at_idx" ON "dataset_item_events"("project_id", "dataset_id", "id", "created_at");