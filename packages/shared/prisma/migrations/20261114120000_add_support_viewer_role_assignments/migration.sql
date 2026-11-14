-- AlterEnum
ALTER TYPE "SystemRole" ADD VALUE 'SUPPORT_VIEWER';

-- AlterTable
ALTER TABLE "role_assignments" ADD COLUMN "expires_at" TIMESTAMP(3);
