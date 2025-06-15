-- DropForeignKey
ALTER TABLE "default_llm_models" DROP CONSTRAINT "default_llm_models_project_id_fkey";

-- DropForeignKey
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_template_id_fkey";

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_template_id_fkey" FOREIGN KEY ("job_template_id") REFERENCES "eval_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "default_llm_models" ADD CONSTRAINT "default_llm_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
