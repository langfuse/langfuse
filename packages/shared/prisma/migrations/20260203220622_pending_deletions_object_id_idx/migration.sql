-- DropIndex
DROP INDEX "public"."pending_deletions_project_id_object_is_deleted_idx";

-- CreateIndex
CREATE INDEX "pending_deletions_project_id_object_is_deleted_object_id_id_idx" ON "pending_deletions"("project_id", "object", "is_deleted", "object_id", "id");
