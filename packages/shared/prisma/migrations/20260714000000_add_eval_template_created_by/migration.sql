-- AlterTable
ALTER TABLE "eval_templates" ADD COLUMN     "created_by_user_id" TEXT;

-- Backfill creators for existing project templates from their audit-log
-- create records. DISTINCT ON keeps the earliest record per template in the
-- unexpected case of duplicates. Managed catalog templates (project_id IS
-- NULL) and API-key-created templates stay NULL. The join to users keeps the
-- foreign key below satisfiable when the creating user was deleted.
UPDATE "eval_templates" et
SET "created_by_user_id" = al.user_id
FROM (
  SELECT DISTINCT ON ("resource_id") "resource_id", "user_id"
  FROM "audit_logs"
  WHERE "resource_type" = 'evalTemplate'
    AND "action" = 'create'
    AND "user_id" IS NOT NULL
  ORDER BY "resource_id", "created_at" ASC
) al
WHERE et."id" = al."resource_id"
  AND et."project_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "users" u WHERE u."id" = al."user_id");

-- AddForeignKey
ALTER TABLE "eval_templates" ADD CONSTRAINT "eval_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
