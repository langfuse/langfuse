-- DropIndex
DROP INDEX IF EXISTS "pending_deletions_project_id_object_is_deleted_idx";

-- Cleanup processed rows before creating the wider index.
-- `is_deleted = true` rows are no longer needed by the deletion worker and can
-- grow very large, causing index creation to time out on busy installations.
DELETE FROM "pending_deletions"
WHERE "is_deleted" = true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pending_deletions_project_id_object_is_deleted_object_id_id_idx"
ON "pending_deletions"("project_id", "object", "is_deleted", "object_id", "id");
