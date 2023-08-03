/*
  Warnings:

  - You are about to drop the column `prompt_version` on the `observations` table. All the data in the column will be lost.
  - You are about to drop the column `release_version` on the `traces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "observations" DROP COLUMN "prompt_version",
ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "traces" DROP COLUMN "release_version",
ADD COLUMN     "release" TEXT;
