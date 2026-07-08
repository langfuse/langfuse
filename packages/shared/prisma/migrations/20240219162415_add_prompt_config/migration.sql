-- AlterTable
ALTER TABLE "prompts" ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}';
