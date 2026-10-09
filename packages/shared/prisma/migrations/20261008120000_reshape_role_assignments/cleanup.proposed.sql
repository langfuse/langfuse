-- Apply in a later release after old replicas drain and their rollback window closes.
-- Move this proposal into a new timestamped migration.sql; Prisma does not run it here.
-- Remove the deprecated fields, relations, and indexes from schema.prisma in that release.
BEGIN;

LOCK TABLE "role_assignments" IN ACCESS EXCLUSIVE MODE;

DROP TRIGGER "role_assignments_fill_legacy_insert" ON "role_assignments";
DROP TRIGGER "role_assignments_10_validate_legacy_update" ON "role_assignments";
DROP TRIGGER "role_assignments_20_sync_legacy_update" ON "role_assignments";

DROP FUNCTION "role_assignments_fill_legacy_insert"();
DROP FUNCTION "role_assignments_validate_legacy_update"();
DROP FUNCTION "role_assignments_sync_legacy_update"();

ALTER TABLE "role_assignments"
    DROP CONSTRAINT "role_assignments_legacy_fields_check",
    DROP CONSTRAINT "role_assignments_exactly_one_principal",
    DROP CONSTRAINT "role_assignments_exactly_one_owner";

-- Dropping these columns also removes their foreign keys and indexes.
ALTER TABLE "role_assignments"
    DROP COLUMN "owner_org_id",
    DROP COLUMN "owner_project_id",
    DROP COLUMN "principal_user_id",
    DROP COLUMN "principal_api_key_id";

COMMIT;
