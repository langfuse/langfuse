/*
  Warnings:

  - Added the required column `project_id` to the `observations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "project_id" TEXT;

-- Backfill data in the new column
UPDATE "observations" o
SET "project_id" = t."project_id"
FROM "traces" t
WHERE o."trace_id" = t."id";

-- To be applied in separate migration after application release to minimize ingestion downtime
-- ALTER TABLE "observations"
-- ALTER COLUMN "project_id" SET NOT NULL;


-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
