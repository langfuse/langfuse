ALTER TABLE "membership_invitations" ALTER COLUMN "project_role" DROP NOT NULL,
ALTER COLUMN "org_role" SET NOT NULL;
