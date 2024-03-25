/*
  Warnings:

  - Added the required column `delay` to the `job_configurations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN     "delay" INTEGER NOT NULL;
