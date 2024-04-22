/*
  Warnings:

  - A unique constraint covering the columns `[project_id,name]` on the table `llm_api_keys` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_project_id_name_key" ON "llm_api_keys"("project_id", "name");
