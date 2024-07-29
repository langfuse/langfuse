-- CreateIndex
CREATE INDEX CONCURRENTLY "scores_name_data_type_source_idx" ON "scores"("name", "data_type", "source");