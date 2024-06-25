ALTER TABLE "membership_invitations" RENAME COLUMN "role" TO "project_role";
ALTER TABLE "membership_invitations" ADD COLUMN "org_role" "OrganizationRole";
