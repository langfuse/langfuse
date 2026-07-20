-- Record the scope that produced each new execution. Existing executions stay
-- unscoped because their originating evaluator-scope pair cannot be recovered.
ALTER TABLE "job_executions" ADD COLUMN "run_scope_id" TEXT;

CREATE INDEX "job_executions_project_id_job_configuration_id_run_scope_id_idx" ON "job_executions"("project_id", "job_configuration_id", "run_scope_id");

ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_run_scope_id_fkey" FOREIGN KEY ("run_scope_id") REFERENCES "eval_run_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
