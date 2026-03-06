-- AlterTable
ALTER TABLE "sso_configs" ADD COLUMN     "callback_url_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sso_configs_callback_url_id_key" ON "sso_configs"("callback_url_id");
