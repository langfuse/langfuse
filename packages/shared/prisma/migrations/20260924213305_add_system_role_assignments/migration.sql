-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE', 'PROJECT', 'ORGANIZATION', 'SCORES_INGEST', 'INGEST', 'LLM_GATEWAY');

-- CreateTable
CREATE TABLE "system_role_assignments" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "system_role" "SystemRole" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_role_assignments_org_id_idx" ON "system_role_assignments"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_role_assignments_principal_id_owner_id_system_role_key" ON "system_role_assignments"("principal_id", "owner_id", "system_role");

-- AddForeignKey
ALTER TABLE "system_role_assignments" ADD CONSTRAINT "system_role_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
