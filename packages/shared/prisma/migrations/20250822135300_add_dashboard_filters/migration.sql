-- AlterTable
ALTER TABLE "dashboards" ADD COLUMN     "filters" JSONB NOT NULL DEFAULT '[]';
