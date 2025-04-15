-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('ORGANIZATION', 'PROJECT');

-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "scope" "ApiKeyScope" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "project_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "api_keys_organization_id_idx" ON "api_keys"("organization_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
