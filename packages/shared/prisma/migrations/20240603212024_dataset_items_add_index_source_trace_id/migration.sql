-- CreateIndex
CREATE INDEX CONCURRENTLY "dataset_items_source_trace_id_idx" ON "dataset_items" USING HASH ("source_trace_id");
