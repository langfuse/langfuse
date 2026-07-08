-- AlterTable
ALTER TABLE "job_executions" ADD COLUMN "execution_trace_id" TEXT;

-- AlterEnum
ALTER TYPE "JobExecutionStatus" ADD VALUE 'DELAYED';
