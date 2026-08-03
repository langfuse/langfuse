-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "created_by_api_key_id" TEXT;

-- CreateIndex
CREATE INDEX "api_keys_created_by_api_key_id_idx" ON "api_keys"("created_by_api_key_id");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_api_key_id_fkey" FOREIGN KEY ("created_by_api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
