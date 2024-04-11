-- CreateEnum
CREATE TYPE "JobConfigState" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN     "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE';
