-- CreateEnum
CREATE TYPE "ScoreType" AS ENUM ('USER', 'EXPERT', 'EVAL', 'DEFAULT');

-- AlterTable
ALTER TABLE "scores" ADD COLUMN     "type" "ScoreType" NOT NULL DEFAULT 'DEFAULT';
