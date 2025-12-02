/*
  Warnings:

  - The primary key for the `dataset_items` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
BEGIN;

-- 1. Drop pk constraint that prevents appending
ALTER TABLE "dataset_items" DROP CONSTRAINT "dataset_items_pkey",
 -- 2. Enforce Physical Identity
ADD CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("sys_id", "project_id");

COMMIT;
