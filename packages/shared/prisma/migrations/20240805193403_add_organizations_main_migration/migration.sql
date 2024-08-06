/*
  Warnings:

  - The values [OWNER] on the enum `ProjectRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `role` on the `membership_invitations` table. All the data in the column will be lost.
  - You are about to drop the column `cloud_config` on the `projects` table. All the data in the column will be lost.
  - Added the required column `org_id` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `org_id` to the `membership_invitations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `org_role` to the `membership_invitations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `org_membership_id` to the `project_memberships` table without a default value. This is not possible if the table is not empty.
  - Added the required column `org_id` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- OrganizationRole
-- Create OrganizationRole
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE');



-- Create empty table ORGANIZATIONS
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloud_config" JSONB,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);


-- Add org_id to projects
ALTER TABLE "projects" ADD COLUMN "org_id";


-- Backfill: create a new organization for each project, move cloudConfig, and set the org_id on the project
INSERT INTO "organizations" ("id", "name", "cloud_config")
SELECT CONCAT('', "id"), "name", "cloud_config"
FROM "projects";



-- Create empty table ORGANIZATION MEMBERSHIPS
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);
-- Add indexes
CREATE INDEX "organization_memberships_user_id_idx" ON "organization_memberships"("user_id");
CREATE INDEX "organization_memberships_org_id_idx" ON "organization_memberships"("org_id");
CREATE UNIQUE INDEX "organization_memberships_org_id_user_id_key" ON "organization_memberships"("org_id", "user_id");
-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;







-- AUDIT LOGS
-- DropForeignKey, just index on these, should remain after project/org/user deletions
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_project_id_fkey";
-- Drop not null on project level cols
ALTER TABLE "audit_logs" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "user_project_role" DROP NOT NULL;
-- Add org-level cols
ALTER TABLE "audit_logs" ADD COLUMN "org_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "user_org_role" "OrganizationRole";
-- Backfill org_id
UPDATE "audit_logs"
SET "org_id" = "projects"."org_id"
FROM "projects"
WHERE "audit_logs"."project_id" = "projects"."id";
-- Backfill user_org_role with value from user_project_role
UPDATE "audit_logs"
SET "user_org_role" = "user_project_role"::"OrganizationRole";
-- Add not null on org level cols
ALTER TABLE "audit_logs" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "user_org_role" SET NOT NULL;
-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");


-- MEMBERSHIP INVITATIONS
-- DropForeignKey
ALTER TABLE "membership_invitations" DROP CONSTRAINT "membership_invitations_project_id_fkey";
-- AlterTable
ALTER TABLE "membership_invitations" DROP COLUMN "role",
ADD COLUMN     "org_id" TEXT NOT NULL,
ADD COLUMN     "org_role" "OrganizationRole" NOT NULL,
ADD COLUMN     "project_role" "ProjectRole",
ALTER COLUMN "project_id" DROP NOT NULL;
-- CreateIndex
CREATE INDEX "membership_invitations_org_id_idx" ON "membership_invitations"("org_id");





-- AlterTable
ALTER TABLE "project_memberships" ADD COLUMN     "org_membership_id" TEXT NOT NULL;

-- AlterTable



ALTER TABLE "projects" DROP COLUMN "cloud_config",
ADD COLUMN     "org_id" TEXT NOT NULL;








-- CreateIndex
CREATE INDEX "project_memberships_project_id_idx" ON "project_memberships"("project_id");

-- CreateIndex
CREATE INDEX "project_memberships_org_membership_id_idx" ON "project_memberships"("org_membership_id");

-- CreateIndex
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_org_membership_id_fkey" FOREIGN KEY ("org_membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove OWNER from ProjectRoles
BEGIN;
CREATE TYPE "ProjectRole_new" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');
ALTER TABLE "project_memberships" ALTER COLUMN "role" TYPE "ProjectRole_new" USING ("role"::text::"ProjectRole_new");
ALTER TABLE "membership_invitations" ALTER COLUMN "project_role" TYPE "ProjectRole_new" USING ("project_role"::text::"ProjectRole_new");
ALTER TABLE "audit_logs" ALTER COLUMN "user_project_role" TYPE "ProjectRole_new" USING ("user_project_role"::text::"ProjectRole_new");
ALTER TYPE "ProjectRole" RENAME TO "ProjectRole_old";
ALTER TYPE "ProjectRole_new" RENAME TO "ProjectRole";
DROP TYPE "ProjectRole_old";
COMMIT;