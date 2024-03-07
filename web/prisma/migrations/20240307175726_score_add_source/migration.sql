-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('API', 'REVIEW');

-- Add a nullable column first
ALTER TABLE "scores" ADD COLUMN "source" "ScoreSource";

-- Set default values conditionally
UPDATE "scores"
SET "source" = CASE
    WHEN "name" = 'manual-score' THEN 'REVIEW'
    ELSE 'API'
END;

-- Alter column to not null after setting default values
ALTER TABLE "scores" ALTER COLUMN "source" SET NOT NULL;