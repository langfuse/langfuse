-- Rename table, will cause a downtime as it needs to be locked and synced with TRPC API
ALTER TABLE "memberships"
RENAME TO "project_memberships";

-- AlterTable
ALTER TABLE "project_memberships" RENAME CONSTRAINT "memberships_pkey" TO "project_memberships_pkey";

-- RenameForeignKey
ALTER TABLE "project_memberships" RENAME CONSTRAINT "memberships_project_id_fkey" TO "project_memberships_project_id_fkey";

-- RenameForeignKey
ALTER TABLE "project_memberships" RENAME CONSTRAINT "memberships_user_id_fkey" TO "project_memberships_user_id_fkey";

-- RenameIndex
ALTER INDEX "memberships_user_id_idx" RENAME TO "project_memberships_user_id_idx";
