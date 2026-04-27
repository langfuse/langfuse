-- CreateEnum
CREATE TYPE "ApiKeyAccessPermission" AS ENUM ('READ_ONLY', 'READ_AND_WRITE');

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "access_permission" "ApiKeyAccessPermission" NOT NULL DEFAULT 'READ_AND_WRITE';
