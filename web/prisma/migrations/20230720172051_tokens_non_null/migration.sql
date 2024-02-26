/*
  Warnings:

  - Made the column `completion_tokens` on table `observations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `prompt_tokens` on table `observations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `total_tokens` on table `observations` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
UPDATE observations SET prompt_tokens = COALESCE(prompt_tokens, 0);
UPDATE observations SET completion_tokens = COALESCE(completion_tokens, 0);
UPDATE observations SET total_tokens = COALESCE(total_tokens, 0);

ALTER TABLE "observations"
ALTER COLUMN "completion_tokens" SET DEFAULT 0,
ALTER COLUMN "prompt_tokens" SET DEFAULT 0,
ALTER COLUMN "total_tokens" SET DEFAULT 0,
ALTER COLUMN "completion_tokens" SET NOT NULL,
ALTER COLUMN "prompt_tokens" SET NOT NULL,
ALTER COLUMN "total_tokens" SET NOT NULL;
