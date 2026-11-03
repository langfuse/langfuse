-- AlterTable
ALTER TABLE "annotation_queues" ADD COLUMN IF NOT EXISTS "display_columns" JSONB NOT NULL DEFAULT '[]';
