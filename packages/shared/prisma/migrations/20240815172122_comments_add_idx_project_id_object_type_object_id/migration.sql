-- CreateIndex
CREATE INDEX CONCURRENTLY "comments_project_id_object_type_object_id_idx" ON "comments"("project_id", "object_type", "object_id");
