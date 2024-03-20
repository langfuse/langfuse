-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('API', 'REVIEW');

-- AlterTable
ALTER TABLE "scores" ADD COLUMN     "source" "ScoreSource" NOT NULL DEFAULT 'API';
