/*
  Warnings:

  - A unique constraint covering the columns `[sys_id,project_id]` on the table `dataset_items` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY "dataset_items_sys_id_project_id_key" ON "dataset_items"("sys_id", "project_id");

