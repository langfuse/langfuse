-- On PostgreSQL, triggers keep the legacy columns (owner_project_id,
-- principal_user_id, principal_api_key_id, owner_org_id) in step with the new
-- ones, in both directions, so that application versions from before this
-- migration keep working during a rolling deploy. CockroachDB cannot run those
-- triggers: it has no column lists on triggers and cannot assign to NEW fields.
--
-- Here the legacy columns become stored computed columns of the new ones. The
-- application writes only the new columns, and role_assignments_legacy_fields_check
-- already requires the legacy columns to equal exactly these expressions. A
-- CockroachDB database never runs application versions from before this
-- migration, so nothing writes the legacy columns directly.
--
-- Other differences:
-- - No BEGIN/COMMIT or LOCK TABLE: CockroachDB has no LOCK TABLE, and cannot
--   fill a column in the transaction that adds it.
-- - The foreign keys on the legacy columns have no ON UPDATE CASCADE, which
--   CockroachDB does not allow on computed columns. Each computed column
--   follows its source column, whose foreign key does cascade updates.
--
-- A later migration that drops these triggers, functions or legacy columns
-- needs an override too: on CockroachDB the triggers and functions do not exist,
-- and the legacy columns are computed and sit at the end of the table.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "role_assignments"
        WHERE "owner_org_id" IS NOT NULL AND "owner_org_id" <> "org_id"
    ) THEN
        RAISE EXCEPTION 'Cannot reshape role assignments whose organization owner differs from their tenant';
    END IF;
END $$;

ALTER TABLE "role_assignments"
    ADD COLUMN "project_id" TEXT,
    ADD COLUMN "user_id" TEXT,
    ADD COLUMN "api_key_id" TEXT,
    ADD COLUMN "owner_id" TEXT,
    ADD COLUMN "principal_id" TEXT,
    ADD COLUMN "role_id" TEXT;

UPDATE "role_assignments"
SET "project_id" = "owner_project_id",
    "user_id" = "principal_user_id",
    "api_key_id" = "principal_api_key_id",
    "owner_id" = CASE
        WHEN "owner_project_id" IS NOT NULL THEN 'project/' || "owner_project_id"
        ELSE 'organization/' || "owner_org_id"
    END,
    "principal_id" = CASE
        WHEN "principal_user_id" IS NOT NULL THEN 'user/' || "principal_user_id"
        ELSE 'apiKey/' || "principal_api_key_id"
    END,
    "role_id" = 'system/' || "system_role"::text;

ALTER TABLE "role_assignments"
    ALTER COLUMN "owner_id" SET NOT NULL,
    ALTER COLUMN "principal_id" SET NOT NULL,
    ALTER COLUMN "role_id" SET NOT NULL;

-- Replace the legacy columns with computed columns. Everything that references
-- them is dropped first and recreated afterwards with the same name.
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_exactly_one_principal";
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_exactly_one_owner";
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_principal_user_id_fkey";
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_principal_api_key_id_fkey";
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_owner_org_id_fkey";
ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_owner_project_id_fkey";
DROP INDEX "role_assignments_user_org_role_key";
DROP INDEX "role_assignments_user_project_role_key";
DROP INDEX "role_assignments_api_key_org_role_key";
DROP INDEX "role_assignments_api_key_project_role_key";
DROP INDEX "role_assignments_owner_org_id_idx";
DROP INDEX "role_assignments_owner_project_id_idx";

ALTER TABLE "role_assignments" DROP COLUMN "principal_user_id";
ALTER TABLE "role_assignments" DROP COLUMN "principal_api_key_id";
ALTER TABLE "role_assignments" DROP COLUMN "owner_org_id";
ALTER TABLE "role_assignments" DROP COLUMN "owner_project_id";

ALTER TABLE "role_assignments"
    ADD COLUMN "principal_user_id" TEXT AS ("user_id") STORED,
    ADD COLUMN "principal_api_key_id" TEXT AS ("api_key_id") STORED,
    ADD COLUMN "owner_org_id" TEXT AS (CASE WHEN "project_id" IS NULL THEN "org_id" END) STORED,
    ADD COLUMN "owner_project_id" TEXT AS ("project_id") STORED;

ALTER TABLE "role_assignments"
    ADD CONSTRAINT "role_assignments_exactly_one_principal" CHECK (("principal_user_id" IS NOT NULL) <> ("principal_api_key_id" IS NOT NULL)),
    ADD CONSTRAINT "role_assignments_exactly_one_owner" CHECK (("owner_org_id" IS NOT NULL) <> ("owner_project_id" IS NOT NULL));

CREATE UNIQUE INDEX "role_assignments_user_org_role_key" ON "role_assignments"("principal_user_id", "owner_org_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_user_project_role_key" ON "role_assignments"("principal_user_id", "owner_project_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_api_key_org_role_key" ON "role_assignments"("principal_api_key_id", "owner_org_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_api_key_project_role_key" ON "role_assignments"("principal_api_key_id", "owner_project_id", "system_role");
CREATE INDEX "role_assignments_owner_org_id_idx" ON "role_assignments"("owner_org_id");
CREATE INDEX "role_assignments_owner_project_id_idx" ON "role_assignments"("owner_project_id");

ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_principal_user_id_fkey" FOREIGN KEY ("principal_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_principal_api_key_id_fkey" FOREIGN KEY ("principal_api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_owner_project_id_fkey" FOREIGN KEY ("owner_project_id") REFERENCES "projects"("id") ON DELETE CASCADE;

ALTER TABLE "role_assignments"
    ADD CONSTRAINT "role_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "role_assignments_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "role_assignments_owner_check" CHECK (
        "owner_id" = CASE
            WHEN "project_id" IS NOT NULL THEN 'project/' || "project_id"
            ELSE 'organization/' || "org_id"
        END
    ),
    ADD CONSTRAINT "role_assignments_principal_check" CHECK (
        ("user_id" IS NOT NULL AND "api_key_id" IS NULL AND "principal_id" = 'user/' || "user_id")
        OR
        ("user_id" IS NULL AND "api_key_id" IS NOT NULL AND "principal_id" = 'apiKey/' || "api_key_id")
    ),
    ADD CONSTRAINT "role_assignments_role_check" CHECK (
        "role_id" = 'system/' || "system_role"::text
    ),
    ADD CONSTRAINT "role_assignments_legacy_fields_check" CHECK (
        "project_id" IS NOT DISTINCT FROM "owner_project_id"
        AND "user_id" IS NOT DISTINCT FROM "principal_user_id"
        AND "api_key_id" IS NOT DISTINCT FROM "principal_api_key_id"
        AND "owner_org_id" IS NOT DISTINCT FROM CASE WHEN "project_id" IS NULL THEN "org_id" END
    );

CREATE UNIQUE INDEX "role_assignments_owner_id_principal_id_role_id_key" ON "role_assignments"("owner_id", "principal_id", "role_id");
CREATE INDEX "role_assignments_project_id_idx" ON "role_assignments"("project_id");
CREATE INDEX "role_assignments_principal_id_idx" ON "role_assignments"("principal_id");
CREATE INDEX "role_assignments_user_id_idx" ON "role_assignments"("user_id");
CREATE INDEX "role_assignments_api_key_id_idx" ON "role_assignments"("api_key_id");
