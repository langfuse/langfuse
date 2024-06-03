/*
  Warnings:

  - Made the column `project_id` on table `scores` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "scores" ALTER COLUMN "project_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
