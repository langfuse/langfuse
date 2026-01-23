/*
  Warnings:

  - The primary key for the `dataset_items` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "dataset_items" DROP CONSTRAINT "dataset_items_pkey",
ADD CONSTRAINT "dataset_items_pkey" PRIMARY KEY USING INDEX "dataset_items_id_project_id_valid_from_key";
