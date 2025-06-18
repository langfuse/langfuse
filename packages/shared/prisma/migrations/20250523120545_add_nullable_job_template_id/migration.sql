-- AlterTable
ALTER TABLE "job_executions" ADD COLUMN "job_template_id" TEXT;
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_template_id_fkey" FOREIGN KEY ("job_template_id") REFERENCES "eval_templates"("id") ON DELETE SET NULL;
