/*
  Warnings:

  - Made the column `data_type` on table `scores` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "scores" ALTER COLUMN "data_type" SET NOT NULL;
