-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "prompt_version" TEXT;

-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "release_version" TEXT;
