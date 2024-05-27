/*
  Warnings:

  - The values [REVIEW] on the enum `ScoreSource` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ScoreSource_new" AS ENUM ('ANNOTATION', 'API', 'EVAL');
ALTER TABLE "scores" ALTER COLUMN "source" TYPE "ScoreSource_new" USING ("source"::text::"ScoreSource_new");
ALTER TYPE "ScoreSource" RENAME TO "ScoreSource_old";
ALTER TYPE "ScoreSource_new" RENAME TO "ScoreSource";
DROP TYPE "ScoreSource_old";
COMMIT;
