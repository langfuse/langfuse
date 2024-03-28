/*
  Warnings:

  - You are about to drop the column `createdAt` on the `metrics` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "metrics" DROP COLUMN "createdAt",
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "observations" ALTER COLUMN "start_time" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "traces" ALTER COLUMN "timestamp" SET DEFAULT CURRENT_TIMESTAMP;
