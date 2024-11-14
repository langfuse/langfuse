-- DropForeignKey
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_input_trace_id_fkey";

-- AlterTable
ALTER TABLE "job_executions" ADD COLUMN     "job_input_dataset_item_id" TEXT,
ADD COLUMN     "job_input_observation_id" TEXT;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_input_dataset_item_id_project_id_fkey" FOREIGN KEY ("job_input_dataset_item_id", "project_id") REFERENCES "dataset_items"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
