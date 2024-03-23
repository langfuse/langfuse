/*
  Warnings:

  - You are about to drop the column `parentObservationId` on the `observations` table. All the data in the column will be lost.
  - Added the required column `type` to the `observations` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "observations" DROP CONSTRAINT "observations_parentObservationId_fkey";

-- AlterTable
ALTER TABLE "observations" DROP COLUMN "parentObservationId",
ADD COLUMN     "parent_observation_id" TEXT,
ADD COLUMN     "type" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_parent_observation_id_fkey" FOREIGN KEY ("parent_observation_id") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
