-- CockroachDB cannot rewrite the type of an indexed column, so the index on
-- "scores"."source" is dropped around the type change and recreated.

/*
  Warnings:

  - The values [REVIEW] on the enum `ScoreSource` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ScoreSource_new" AS ENUM ('ANNOTATION', 'API', 'EVAL');
DROP INDEX "scores_source_idx";
ALTER TABLE "scores" ALTER COLUMN "source" TYPE "ScoreSource_new" USING ("source"::text::"ScoreSource_new");
CREATE INDEX "scores_source_idx" ON "scores"("source");
ALTER TYPE "ScoreSource" RENAME TO "ScoreSource_old";
ALTER TYPE "ScoreSource_new" RENAME TO "ScoreSource";
DROP TYPE "ScoreSource_old";
COMMIT;
