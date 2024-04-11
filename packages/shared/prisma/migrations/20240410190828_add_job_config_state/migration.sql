-- CreateEnum
CREATE TYPE "JobConfigState" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN     "state" "JobConfigState" NOT NULL DEFAULT 'ACTIVE';
