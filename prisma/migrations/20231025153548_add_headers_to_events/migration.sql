-- AlterTable
ALTER TABLE "events" ADD COLUMN     "headers" JSONB NOT NULL DEFAULT '{}';
