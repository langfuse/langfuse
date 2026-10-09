BEGIN;

LOCK TABLE "role_assignments" IN ACCESS EXCLUSIVE MODE;

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

CREATE FUNCTION "role_assignments_fill_legacy_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW."project_id" := COALESCE(NEW."project_id", NEW."owner_project_id");
    NEW."owner_project_id" := COALESCE(NEW."owner_project_id", NEW."project_id");
    NEW."user_id" := COALESCE(NEW."user_id", NEW."principal_user_id");
    NEW."principal_user_id" := COALESCE(NEW."principal_user_id", NEW."user_id");
    NEW."api_key_id" := COALESCE(NEW."api_key_id", NEW."principal_api_key_id");
    NEW."principal_api_key_id" := COALESCE(NEW."principal_api_key_id", NEW."api_key_id");

    IF NEW."owner_id" IS NULL THEN
        NEW."owner_id" := CASE
            WHEN NEW."owner_project_id" IS NOT NULL THEN 'project/' || NEW."owner_project_id"
            ELSE 'organization/' || NEW."owner_org_id"
        END;
    ELSIF NEW."owner_project_id" IS NULL
        AND NEW."owner_org_id" IS NULL
        AND NEW."owner_id" = 'organization/' || NEW."org_id" THEN
        NEW."owner_org_id" := NEW."org_id";
    END IF;

    IF NEW."principal_id" IS NULL THEN
        NEW."principal_id" := CASE
            WHEN NEW."principal_user_id" IS NOT NULL THEN 'user/' || NEW."principal_user_id"
            ELSE 'apiKey/' || NEW."principal_api_key_id"
        END;
    END IF;

    IF NEW."role_id" IS NULL THEN
        NEW."role_id" := 'system/' || NEW."system_role"::text;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER "role_assignments_fill_legacy_insert"
BEFORE INSERT ON "role_assignments"
FOR EACH ROW EXECUTE FUNCTION "role_assignments_fill_legacy_insert"();

ALTER TABLE "role_assignments"
    ALTER COLUMN "owner_id" SET NOT NULL,
    ALTER COLUMN "principal_id" SET NOT NULL,
    ALTER COLUMN "role_id" SET NOT NULL;

CREATE FUNCTION "role_assignments_validate_legacy_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."project_id" IS DISTINCT FROM NEW."owner_project_id"
        OR NEW."user_id" IS DISTINCT FROM NEW."principal_user_id"
        OR NEW."api_key_id" IS DISTINCT FROM NEW."principal_api_key_id"
        OR NEW."owner_org_id" IS DISTINCT FROM (CASE WHEN NEW."project_id" IS NULL THEN NEW."org_id" END) THEN
        RAISE EXCEPTION 'Role assignment legacy fields must match the active fields'
            USING ERRCODE = '23514', CONSTRAINT = 'role_assignments_legacy_fields_check';
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION "role_assignments_sync_legacy_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW."owner_project_id" := NEW."project_id";
    NEW."principal_user_id" := NEW."user_id";
    NEW."principal_api_key_id" := NEW."api_key_id";
    NEW."owner_org_id" := CASE WHEN NEW."project_id" IS NULL THEN NEW."org_id" END;
    RETURN NEW;
END $$;

CREATE TRIGGER "role_assignments_10_validate_legacy_update"
BEFORE UPDATE OF "owner_project_id", "principal_user_id", "principal_api_key_id", "owner_org_id" ON "role_assignments"
FOR EACH ROW EXECUTE FUNCTION "role_assignments_validate_legacy_update"();

CREATE TRIGGER "role_assignments_20_sync_legacy_update"
BEFORE UPDATE OF "project_id", "user_id", "api_key_id", "org_id" ON "role_assignments"
FOR EACH ROW EXECUTE FUNCTION "role_assignments_sync_legacy_update"();

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

COMMIT;
