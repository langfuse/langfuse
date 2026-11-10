-- CockroachDB has no HASH index access method; this is a B-tree index.

-- CreateIndex
CREATE INDEX "dataset_items_source_trace_id_idx" ON "dataset_items"("source_trace_id");
