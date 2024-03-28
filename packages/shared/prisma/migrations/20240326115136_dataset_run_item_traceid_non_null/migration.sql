/*
  Warnings:

  - Made the column `trace_id` on table `dataset_run_items` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "dataset_run_items" ALTER COLUMN "trace_id" SET NOT NULL;
