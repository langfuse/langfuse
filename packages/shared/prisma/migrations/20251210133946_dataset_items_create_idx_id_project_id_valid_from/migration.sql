/*
  Warnings:

  - A unique constraint covering the columns `[id,project_id,valid_from]` on the table `dataset_items` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "dataset_items_id_project_id_valid_from_key" ON "dataset_items"("id", "project_id", "valid_from");

