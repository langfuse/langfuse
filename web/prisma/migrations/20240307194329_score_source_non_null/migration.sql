
-- Backfill
-- Previous migration did backfill in looped batches
UPDATE "scores"
SET "source" = CASE
  WHEN name = 'manual-score' THEN 'REVIEW'::"ScoreSource"
  ELSE 'API'::"ScoreSource"
END
WHERE "source" IS NULL;


-- AlterTable
ALTER TABLE "scores" ALTER COLUMN "source" SET NOT NULL;
