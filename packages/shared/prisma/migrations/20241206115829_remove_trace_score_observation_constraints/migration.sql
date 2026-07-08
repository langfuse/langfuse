-- DropForeignKey
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_output_score_id_fkey";

-- DropForeignKey
ALTER TABLE "traces" DROP CONSTRAINT "traces_session_id_project_id_fkey";
