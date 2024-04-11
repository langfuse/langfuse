/*
  Warnings:

  - You are about to drop the column `state` on the `job_configurations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "job_configurations" DROP COLUMN "state",
ADD COLUMN     "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE';
