/*
  Warnings:

  - Added the required column `source` to the `scores` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('API', 'REVIEW');

-- AlterTable
ALTER TABLE "scores" ADD COLUMN     "source" "ScoreSource" NOT NULL;
