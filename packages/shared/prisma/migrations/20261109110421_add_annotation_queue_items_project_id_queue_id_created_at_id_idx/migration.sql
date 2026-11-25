-- CreateIndex
CREATE INDEX CONCURRENTLY "annotation_queue_items_project_id_queue_id_created_at_id_idx" ON "annotation_queue_items"("project_id", "queue_id", "created_at", "id");
