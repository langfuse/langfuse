-- Backfill the scores source for 'REVIEW' to be 'ANNOTATION'
UPDATE "scores"
SET "source" = 'ANNOTATION'::"ScoreSource"
WHERE "source" = 'REVIEW'::"ScoreSource";
