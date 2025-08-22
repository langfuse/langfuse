-- AlterTable
ALTER TABLE "dashboards" ADD COLUMN "filters" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "date_range" TEXT;
