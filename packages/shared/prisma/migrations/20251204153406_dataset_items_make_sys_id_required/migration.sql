/*
  Warnings:

  - Made the column `sys_id` on table `dataset_items` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "dataset_items" ALTER COLUMN "sys_id" SET NOT NULL;
