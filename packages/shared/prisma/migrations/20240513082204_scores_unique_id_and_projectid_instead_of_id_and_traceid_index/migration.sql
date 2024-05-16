/*
  Warnings:

  - A unique constraint covering the columns `[id,project_id]` on the table `scores` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY "scores_id_project_id_key" ON "scores"("id", "project_id");
