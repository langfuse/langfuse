/*
  Warnings:

  - The values [LLMCALL] on the enum `ObservationType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `attributes` on the `observations` table. All the data in the column will be lost.
  - You are about to drop the column `attributes` on the `traces` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ObservationType_new" AS ENUM ('SPAN', 'EVENT', 'GENERATION');
ALTER TABLE "observations" ALTER COLUMN "type" TYPE "ObservationType_new" USING ("type"::text::"ObservationType_new");
ALTER TYPE "ObservationType" RENAME TO "ObservationType_old";
ALTER TYPE "ObservationType_new" RENAME TO "ObservationType";
DROP TYPE "ObservationType_old";
COMMIT;

-- AlterTable
ALTER TABLE "observations" DROP COLUMN "attributes",
ADD COLUMN     "completion" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "modelParameters" JSONB,
ADD COLUMN     "prompt" JSONB,
ADD COLUMN     "usage" JSONB,
ALTER COLUMN "name" DROP NOT NULL;

-- AlterTable
ALTER TABLE "traces" DROP COLUMN "attributes",
ADD COLUMN     "metadata" JSONB,
ALTER COLUMN "name" DROP NOT NULL;
