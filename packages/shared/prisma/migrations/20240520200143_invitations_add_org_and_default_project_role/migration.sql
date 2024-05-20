/*
  Warnings:

  - You are about to drop the column `role` on the `membership_invitations` table. All the data in the column will be lost.
  - Added the required column `orgRole` to the `membership_invitations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "membership_invitations" DROP COLUMN "role",
ADD COLUMN     "default_project_role" "ProjectRole",
ADD COLUMN     "orgRole" "OrganizationRole" NOT NULL,
ADD COLUMN     "project_role" "ProjectRole";
