-- CreateEnum
CREATE TYPE "ModelScope" AS ENUM ('LANGFUSE', 'PROJECT');

-- AlterTable
ALTER TABLE "models" ADD COLUMN "scope" "ModelScope";

-- Backfill: rows without a project are Langfuse-managed defaults
UPDATE "models"
SET "scope" = CASE
    WHEN "project_id" IS NULL THEN 'LANGFUSE'::"ModelScope"
    ELSE 'PROJECT'::"ModelScope"
END;

ALTER TABLE "models"
    ADD CONSTRAINT "models_scope_owner_check" CHECK (
        ("scope" = 'LANGFUSE' AND "project_id" IS NULL)
        OR
        ("scope" = 'PROJECT' AND "project_id" IS NOT NULL)
    );

ALTER TABLE "models" ALTER COLUMN "scope" SET NOT NULL;