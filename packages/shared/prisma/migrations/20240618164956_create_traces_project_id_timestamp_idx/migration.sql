-- CreateIndex
CREATE INDEX CONCURRENTLY "traces_project_id_timestamp_idx" ON "traces"("project_id", "timestamp");
