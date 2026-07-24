-- CreateIndex
-- Uses CONCURRENTLY so this does NOT take a ShareLock on annotation_queue_items
-- during index creation; concurrent writes to the table are not blocked.
-- IF NOT EXISTS keeps the migration retry-safe if a previous CONCURRENTLY run
-- was interrupted and left an invalid index behind (see langfuse/langfuse#12938
-- review thread). Pattern mirrors 20251210133946_dataset_items_create_idx_id_project_id_valid_from.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "annotation_queue_items_proj_queue_obj_type_key"
  ON "annotation_queue_items"("project_id", "queue_id", "object_id", "object_type");
