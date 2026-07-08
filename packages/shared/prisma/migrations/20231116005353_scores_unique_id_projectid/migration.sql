/*
  Warnings:

  - A unique constraint covering the columns `[id,trace_id]` on the table `scores` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "scores_id_trace_id_key" ON "scores"("id", "trace_id");
