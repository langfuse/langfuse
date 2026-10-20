-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "api_keys_user_id_organization_id_idx" ON "api_keys"("user_id", "organization_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
