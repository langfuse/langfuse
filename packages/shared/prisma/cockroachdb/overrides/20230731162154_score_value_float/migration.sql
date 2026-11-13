-- CockroachDB cannot rewrite the type of an indexed column, so the index on
-- "scores"."value" is dropped around the type change and recreated.

DROP INDEX "scores_value_idx";

-- AlterTable
ALTER TABLE "scores" ALTER COLUMN "value" SET DATA TYPE DOUBLE PRECISION;

CREATE INDEX "scores_value_idx" ON "scores"("value");
