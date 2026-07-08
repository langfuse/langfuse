-- Goal: Rename the enum `MembershipRole` to `ProjectRole` and update all tables that use it

-- Create a new Enum
CREATE TYPE "ProjectRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- Add a temporary column to tables (for each table)
ALTER TABLE "audit_logs" ADD COLUMN "user_project_role_temp" text;
ALTER TABLE "membership_invitations" ADD COLUMN "role_temp" text;
ALTER TABLE "project_memberships" ADD COLUMN "role_temp" text;

-- Copy data over to temporary columns (for each table)
UPDATE "audit_logs" SET "user_project_role_temp" = "user_project_role"::text;
UPDATE "membership_invitations" SET "role_temp" = "role"::text;
UPDATE "project_memberships" SET "role_temp" = "role"::text;

-- Drop old columns
ALTER TABLE "audit_logs" DROP COLUMN "user_project_role";
ALTER TABLE "membership_invitations" DROP COLUMN "role";
ALTER TABLE "project_memberships" DROP COLUMN "role";

-- Rename temporary columns to old column names
ALTER TABLE "audit_logs" RENAME COLUMN "user_project_role_temp" TO "user_project_role";
ALTER TABLE "membership_invitations" RENAME COLUMN "role_temp" TO "role";
ALTER TABLE "project_memberships" RENAME COLUMN "role_temp" TO "role";

-- Convert the text columns to enum columns (for each table)
ALTER TABLE "audit_logs" ALTER COLUMN "user_project_role" TYPE "ProjectRole" USING "user_project_role"::"ProjectRole";
ALTER TABLE "membership_invitations" ALTER COLUMN "role" TYPE "ProjectRole" USING "role"::"ProjectRole";
ALTER TABLE "project_memberships" ALTER COLUMN "role" TYPE "ProjectRole" USING "role"::"ProjectRole";

-- Make the columns NOT NULL (for each table)
ALTER TABLE "audit_logs" ALTER COLUMN "user_project_role" SET NOT NULL;
ALTER TABLE "membership_invitations" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "project_memberships" ALTER COLUMN "role" SET NOT NULL;

-- Now finally, you can drop your old enum
DROP TYPE "MembershipRole";