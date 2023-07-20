-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "completion_tokens" INTEGER,
ADD COLUMN     "prompt_tokens" INTEGER,
ADD COLUMN     "total_tokens" INTEGER;
