/*
  Warnings:

  - A unique constraint covering the columns `[dataset_id,name]` on the table `dataset_runs` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[project_id,name]` on the table `datasets` will be added. If there are existing duplicate values, this will fail.
  - Made the column `input` on table `dataset_items` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "DatasetStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "dataset_items" ADD COLUMN     "status" "DatasetStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "input" SET NOT NULL;

-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "status" "DatasetStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "dataset_runs_dataset_id_name_key" ON "dataset_runs"("dataset_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_project_id_name_key" ON "datasets"("project_id", "name");
