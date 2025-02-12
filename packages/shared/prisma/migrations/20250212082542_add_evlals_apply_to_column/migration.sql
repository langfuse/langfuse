-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN     "time_scope" TEXT[] DEFAULT ARRAY['existing']::TEXT[];
