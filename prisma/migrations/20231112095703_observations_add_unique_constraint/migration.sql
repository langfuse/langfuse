/*
  Warnings:

  - A unique constraint covering the columns `[id,project_id]` on the table `observations` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "observations_id_project_id_key" ON "observations"("id", "project_id");
