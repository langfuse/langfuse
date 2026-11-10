CREATE TYPE "SystemRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE', 'LEGACY_PROJECT_API_KEY', 'LEGACY_ORGANIZATION_API_KEY', 'SCORES_INGEST', 'INGEST', 'AI_GATEWAY');

CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "principal_user_id" TEXT,
    "principal_api_key_id" TEXT,
    "system_role" "SystemRole" NOT NULL,
    "owner_org_id" TEXT,
    "owner_project_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "role_assignments_exactly_one_principal" CHECK (("principal_user_id" IS NOT NULL) <> ("principal_api_key_id" IS NOT NULL)),
    CONSTRAINT "role_assignments_exactly_one_owner" CHECK (("owner_org_id" IS NOT NULL) <> ("owner_project_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "role_assignments_user_org_role_key" ON "role_assignments"("principal_user_id", "owner_org_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_user_project_role_key" ON "role_assignments"("principal_user_id", "owner_project_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_api_key_org_role_key" ON "role_assignments"("principal_api_key_id", "owner_org_id", "system_role");
CREATE UNIQUE INDEX "role_assignments_api_key_project_role_key" ON "role_assignments"("principal_api_key_id", "owner_project_id", "system_role");
CREATE INDEX "role_assignments_org_id_idx" ON "role_assignments"("org_id");
CREATE INDEX "role_assignments_owner_org_id_idx" ON "role_assignments"("owner_org_id");
CREATE INDEX "role_assignments_owner_project_id_idx" ON "role_assignments"("owner_project_id");

ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_principal_user_id_fkey" FOREIGN KEY ("principal_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_principal_api_key_id_fkey" FOREIGN KEY ("principal_api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_owner_org_id_fkey" FOREIGN KEY ("owner_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_owner_project_id_fkey" FOREIGN KEY ("owner_project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
