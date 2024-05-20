-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "user_org_role" "OrganizationRole" NOT NULL DEFAULT 'OWNER';
