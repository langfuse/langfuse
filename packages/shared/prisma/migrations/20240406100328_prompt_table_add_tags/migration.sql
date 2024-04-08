-- AlterTable
ALTER TABLE "prompts" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
