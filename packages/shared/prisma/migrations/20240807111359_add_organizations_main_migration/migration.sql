-- Table ORGANIZATIONS
-- Create empty table ORGANIZATIONS
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cloud_config" JSONB,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
-- Backfill table ORGANIZATIONS: create a new organization for each project, move cloudConfig, and set the org_id on the project to project_id prefixed with 'o'
INSERT INTO "organizations" ("id", "name", "cloud_config", "created_at")
SELECT
  CONCAT('o', "id") as "id", -- This mapping is used in other migration steps as well, keep it consistent
  "name",
  "cloud_config",
  "created_at"
FROM "projects";
-- Drop column cloud_config from projects as it's now on organization level
ALTER TABLE "projects" DROP COLUMN "cloud_config";


-- PROJECT.ORG_ID
-- Add org_id to projects
ALTER TABLE "projects" ADD COLUMN "org_id" TEXT;
-- Backfill: org_id on projects, set it to project_id prefixed with 'o'
UPDATE "projects"
SET "org_id" = CONCAT('o', "id");
-- Set not null after backfill
ALTER TABLE "projects" ALTER COLUMN "org_id" SET NOT NULL;
-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CreateIndex
CREATE INDEX "projects_org_id_idx" ON "projects"("org_id");


-- ORGANIZATION MEMBERSHIPS
-- Create UserRole ENUM
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE');
-- Create empty table
CREATE TABLE "organization_memberships" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
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



-- Migrate project memberships to organization memberships
INSERT INTO "organization_memberships" ("id", "org_id", "user_id", "role", "created_at", "updated_at")
SELECT
  md5(random()::text || clock_timestamp()::text || project_id::text || user_id::text)::uuid AS "id",
  CONCAT('o', "project_id") as "org_id",
  "user_id",
  "role"::text::"Role" as "role",
  "created_at",
  "updated_at"
FROM "project_memberships";



-- Delete all project memberships after migration to organization memberships
DELETE FROM "project_memberships";

-- Add org_membership_id to project_memberships, ok to be not null as it's a new column on a now empty table
ALTER TABLE "project_memberships" ADD COLUMN     "org_membership_id" TEXT NOT NULL;
-- Switch to new UserRole enum
ALTER TABLE "project_memberships" DROP COLUMN "role",
ADD COLUMN     "role" "Role" NOT NULL;
-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_org_membership_id_fkey" FOREIGN KEY ("org_membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CreateIndex
CREATE INDEX "project_memberships_project_id_idx" ON "project_memberships"("project_id");
-- CreateIndex
CREATE INDEX "project_memberships_org_membership_id_idx" ON "project_memberships"("org_membership_id");



-- AUDIT LOGS
-- DropForeignKey, just index on these, should remain after project/org/user deletions
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_project_id_fkey";
-- Drop not null on project level cols
ALTER TABLE "audit_logs" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "user_project_role" DROP NOT NULL;
-- Add org-level cols
ALTER TABLE "audit_logs" ADD COLUMN "org_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "user_org_role" TEXT;
-- Backfill org_id
UPDATE "audit_logs"
SET "org_id" = "projects"."org_id"
FROM "projects"
WHERE "audit_logs"."project_id" = "projects"."id";
-- Backfill user_org_role with value from user_project_role
UPDATE "audit_logs"
SET "user_org_role" = "user_project_role"::text::"Role";
-- Drop and recreate user_project_role column as text column going forward, empty for historical data as it's all on org level now
ALTER TABLE "audit_logs" DROP COLUMN "user_project_role";
ALTER TABLE "audit_logs" ADD COLUMN "user_project_role" TEXT; -- nullable
-- Add not null on org level cols
ALTER TABLE "audit_logs" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "user_org_role" SET NOT NULL;
-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_org_id_idx" ON "audit_logs"("org_id");


-- MEMBERSHIP INVITATIONS
-- Rename sender_id to invited_by_user_id
ALTER TABLE "membership_invitations" DROP CONSTRAINT "membership_invitations_sender_id_fkey";
ALTER TABLE "membership_invitations" RENAME COLUMN "sender_id" TO "invited_by_user_id";
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- DropForeignKey
ALTER TABLE "membership_invitations" DROP CONSTRAINT "membership_invitations_project_id_fkey";
-- AlterTable
ALTER TABLE "membership_invitations" RENAME COLUMN "role" TO "project_role";
ALTER TABLE "membership_invitations" ADD COLUMN "org_id" TEXT;
ALTER TABLE "membership_invitations" ADD COLUMN "org_role" "Role";
ALTER TABLE "membership_invitations" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "membership_invitations" ALTER COLUMN "project_role" DROP NOT NULL;
-- Backfill org id
UPDATE "membership_invitations"
SET "org_id" = "projects"."org_id"
FROM "projects"
WHERE "membership_invitations"."project_id" = "projects"."id";
-- AddForeignKey
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Backfill org role with value from project role
UPDATE "membership_invitations"
SET "org_role" = "project_role"::text::"Role";
-- Set project-level cols to null, as it's now org level for all existing invitations and role enum will change below
UPDATE "membership_invitations"
SET "project_role" = NULL, "project_id" = NULL;
-- Switch to new UserRole enum
ALTER TABLE "membership_invitations" DROP COLUMN "project_role",
ADD COLUMN     "project_role" "Role";

-- AddForeignKey
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add not null on org level cols after backfill
ALTER TABLE "membership_invitations"
ALTER COLUMN "org_id" SET NOT NULL,
ALTER COLUMN "org_role" SET NOT NULL;
-- CreateIndex
CREATE INDEX "membership_invitations_org_id_idx" ON "membership_invitations"("org_id");


-- Drop ProjectRole enum as it is replaced by Role
DROP TYPE "ProjectRole";