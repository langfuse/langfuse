/*
  Warnings:

  - You are about to drop the column `bookmark` on the `traces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "traces" DROP COLUMN "bookmark",
ADD COLUMN     "bookmarked" BOOLEAN NOT NULL DEFAULT false;
