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

-- Compatibility for application versions that insert models without a scope
-- (during a rolling deploy or after a rollback). Fills only a missing scope;
-- current writers always set it explicitly. Drop once those versions are gone.
CREATE FUNCTION "models_fill_legacy_scope"() RETURNS trigger AS $$
BEGIN
    IF NEW."scope" IS NULL THEN
        NEW."scope" := CASE
            WHEN NEW."project_id" IS NULL THEN 'LANGFUSE'::"ModelScope"
            ELSE 'PROJECT'::"ModelScope"
        END;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "models_fill_legacy_scope"
    BEFORE INSERT ON "models"
    FOR EACH ROW
    EXECUTE FUNCTION "models_fill_legacy_scope"();
