-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN     "applyJobTo" TEXT[] DEFAULT ARRAY['existing']::TEXT[];
