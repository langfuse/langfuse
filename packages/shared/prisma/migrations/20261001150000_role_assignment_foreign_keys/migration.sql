BEGIN;

ALTER TABLE "system_role_assignments" RENAME TO "role_assignments";
ALTER TABLE "role_assignments" RENAME CONSTRAINT "system_role_assignments_pkey" TO "role_assignments_pkey";
ALTER TABLE "role_assignments" RENAME CONSTRAINT "system_role_assignments_org_id_fkey" TO "role_assignments_org_id_fkey";
ALTER INDEX "system_role_assignments_org_id_idx" RENAME TO "role_assignments_org_id_idx";

ALTER TABLE "role_assignments"
    ADD COLUMN "principal_user_id" TEXT,
    ADD COLUMN "principal_api_key_id" TEXT,
    ADD COLUMN "owner_org_id" TEXT,
    ADD COLUMN "owner_project_id" TEXT;

UPDATE "role_assignments"
SET "principal_user_id" = CASE WHEN "principal_id" LIKE 'user/%' THEN substring("principal_id" FROM 6) END,
    "principal_api_key_id" = CASE WHEN "principal_id" LIKE 'apiKey/%' THEN substring("principal_id" FROM 8) END,
    "owner_org_id" = CASE WHEN "owner_id" LIKE 'organization/%' THEN substring("owner_id" FROM 14) END,
    "owner_project_id" = CASE WHEN "owner_id" LIKE 'project/%' THEN substring("owner_id" FROM 9) END;

ALTER TABLE "role_assignments"
    ADD CONSTRAINT "role_assignments_exactly_one_principal" CHECK (("principal_user_id" IS NOT NULL) <> ("principal_api_key_id" IS NOT NULL)),
    ADD CONSTRAINT "role_assignments_exactly_one_owner" CHECK (("owner_org_id" IS NOT NULL) <> ("owner_project_id" IS NOT NULL)),
    ADD CONSTRAINT "role_assignments_principal_user_id_fkey" FOREIGN KEY ("principal_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "role_assignments_principal_api_key_id_fkey" FOREIGN KEY ("principal_api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "role_assignments_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "role_assignments_owner_project_id_fkey" FOREIGN KEY ("owner_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_assignments" DROP COLUMN "principal_id", DROP COLUMN "owner_id";

CREATE UNIQUE INDEX "role_assignments_user_org_role_key" ON "role_assignments"("principal_user_id", "owner_org_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_user_project_role_key" ON "role_assignments"("principal_user_id", "owner_project_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_api_key_org_role_key" ON "role_assignments"("principal_api_key_id", "owner_org_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_api_key_project_role_key" ON "role_assignments"("principal_api_key_id", "owner_project_id", "system_role");
CREATE INDEX "role_assignments_owner_org_id_idx" ON "role_assignments"("owner_org_id");
CREATE INDEX "role_assignments_owner_project_id_idx" ON "role_assignments"("owner_project_id");

COMMIT;
