/*
  Warnings:

  - A unique constraint covering the columns `[fast_hashed_secret_key]` on the table `api_keys` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN     "fast_hashed_secret_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_fast_hashed_secret_key_key" ON "api_keys"("fast_hashed_secret_key");

-- CreateIndex
CREATE INDEX "api_keys_project_id_idx" ON "api_keys"("project_id");

-- CreateIndex
CREATE INDEX "api_keys_public_key_idx" ON "api_keys"("public_key");

-- CreateIndex
CREATE INDEX "api_keys_hashed_secret_key_idx" ON "api_keys"("hashed_secret_key");

-- CreateIndex
CREATE INDEX "api_keys_fast_hashed_secret_key_idx" ON "api_keys"("fast_hashed_secret_key");
