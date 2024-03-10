/*
  Warnings:

  - Added the required column `name` to the `eval_templates` table without a default value. This is not possible if the table is not empty.
  - Added the required column `version` to the `eval_templates` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "eval_templates" ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL;
