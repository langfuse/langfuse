-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trace_sessions_project_id_created_at_idx" ON "trace_sessions"("project_id", "created_at" DESC);
