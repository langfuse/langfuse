-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

-- CreateIndex
CREATE INDEX CONCURRENTLY "job_executions_project_id_job_configuration_id_job_input_tr_idx" ON "job_executions"("project_id", "job_configuration_id", "job_input_trace_id");
