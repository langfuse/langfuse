-- DropForeignKey
ALTER TABLE "membership_invitations" DROP CONSTRAINT "membership_invitations_project_id_fkey";

-- AlterTable
ALTER TABLE "membership_invitations" ALTER COLUMN "project_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "membership_invitations" ADD CONSTRAINT "membership_invitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
