-- AlterTable
ALTER TABLE "models" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

-- AddForeignKey
ALTER TABLE "models"
    ADD CONSTRAINT "models_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Each scope requires exactly its own owner column.
ALTER TABLE "models" DROP CONSTRAINT "models_scope_owner_check";
ALTER TABLE "models"
    ADD CONSTRAINT "models_scope_owner_check" CHECK (
        ("scope" = 'LANGFUSE' AND "project_id" IS NULL AND "organization_id" IS NULL)
        OR
        ("scope" = 'PROJECT' AND "project_id" IS NOT NULL AND "organization_id" IS NULL)
        OR
        ("scope" = 'ORGANIZATION' AND "organization_id" IS NOT NULL AND "project_id" IS NULL)
    );
