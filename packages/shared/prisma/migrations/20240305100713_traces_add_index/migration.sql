-- CreateIndex
CREATE INDEX CONCURRENTLY "traces_id_user_id_idx" ON "traces"("id", "user_id");