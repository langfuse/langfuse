-- scores previously created in the Langfuse UI all had the name 'manual-score'
UPDATE "scores"
SET "source" = 'REVIEW'::"ScoreSource"
WHERE "name" = 'manual-score';
