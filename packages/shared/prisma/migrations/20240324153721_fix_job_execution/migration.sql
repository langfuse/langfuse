/*
  Warnings:

  - You are about to drop the column `result` on the `job_executions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "job_executions" DROP COLUMN "result",
ADD COLUMN     "score_id" TEXT;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "scores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
