-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MEMBER');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "membership_invitations" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "project_memberships" ADD COLUMN     "org_membership_id" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "org_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloud_config" JSONB,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "default_project_role" "ProjectRole",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");

-- CreateIndex
CREATE INDEX "organization_memberships_org_id_idx" ON "organization_memberships"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_org_id_user_id_key" ON "organization_memberships"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "membership_invitations_org_id_idx" ON "membership_invitations"("org_id");
