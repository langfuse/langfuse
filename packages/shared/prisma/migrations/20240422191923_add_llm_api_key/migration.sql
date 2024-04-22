/*
  Warnings:

  - You are about to drop the column `name` on the `llm_api_keys` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[project_id,provider]` on the table `llm_api_keys` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "llm_api_keys" DROP COLUMN "name";

-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_project_id_provider_key" ON "llm_api_keys"("project_id", "provider");
