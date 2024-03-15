/*
  Warnings:

  - You are about to drop the column `status` on the `traces` table. All the data in the column will be lost.
  - You are about to drop the column `status_message` on the `traces` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "traces" DROP COLUMN "status",
DROP COLUMN "status_message";
