/*
  Warnings:

  - The primary key for the `dataset_items` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
BEGIN;

-- 1. Drop pk constraint that prevents appending
ALTER TABLE "dataset_items" 
DROP CONSTRAINT "dataset_items_pkey";

-- 2. Add new PK (drop the unique constraint first to avoid duplicate)
ALTER TABLE "dataset_items"
DROP CONSTRAINT "dataset_items_sys_id_project_id_key",
ADD CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("sys_id", "project_id");

COMMIT;