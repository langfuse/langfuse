-- Create the reusable evaluator-to-scope assignment model.
CREATE TABLE "eval_run_scope_assignments" (
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_configuration_id" TEXT NOT NULL,
    "run_scope_id" TEXT NOT NULL,

    CONSTRAINT "eval_run_scope_assignments_pkey" PRIMARY KEY ("job_configuration_id","run_scope_id")
);

-- Preserve links created by the earlier one-scope-per-evaluator model.
INSERT INTO "eval_run_scope_assignments" ("job_configuration_id", "run_scope_id")
SELECT "id", "run_scope_id"
FROM "job_configurations"
WHERE "run_scope_id" IS NOT NULL;

ALTER TABLE "job_configurations" ADD COLUMN "created_by_user_id" TEXT;

-- Recover the original user where an evaluator creation audit record exists.
-- API-created evaluators and records predating audit logs intentionally remain null.
WITH "creators" AS (
  SELECT DISTINCT ON ("audit"."project_id", "audit"."resource_id")
    "audit"."project_id",
    "audit"."resource_id",
    "audit"."user_id"
  FROM "audit_logs" AS "audit"
  INNER JOIN "users" AS "user" ON "user"."id" = "audit"."user_id"
  WHERE "audit"."resource_type" = 'job'
    AND "audit"."action" = 'create'
  ORDER BY "audit"."project_id", "audit"."resource_id", "audit"."created_at" ASC
)
UPDATE "job_configurations" AS "job"
SET "created_by_user_id" = "creator"."user_id"
FROM "creators" AS "creator"
WHERE "job"."created_by_user_id" IS NULL
  AND "creator"."resource_id" = "job"."id"
  AND "creator"."project_id" = "job"."project_id";

ALTER TABLE "eval_run_scopes"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "created_by_user_id" TEXT;

-- Existing executions remain unscoped because their originating assignment
-- cannot be recovered reliably.
ALTER TABLE "job_executions" ADD COLUMN "run_scope_id" TEXT;

CREATE INDEX "eval_run_scope_assignments_run_scope_id_idx" ON "eval_run_scope_assignments"("run_scope_id");
CREATE INDEX "eval_run_scopes_created_by_user_id_idx" ON "eval_run_scopes"("created_by_user_id");
CREATE INDEX "job_configurations_created_by_user_id_idx" ON "job_configurations"("created_by_user_id");
CREATE INDEX "job_executions_project_id_job_configuration_id_run_scope_id_idx" ON "job_executions"("project_id", "job_configuration_id", "run_scope_id");

ALTER TABLE "eval_run_scope_assignments" ADD CONSTRAINT "eval_run_scope_assignments_job_configuration_id_fkey" FOREIGN KEY ("job_configuration_id") REFERENCES "job_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eval_run_scope_assignments" ADD CONSTRAINT "eval_run_scope_assignments_run_scope_id_fkey" FOREIGN KEY ("run_scope_id") REFERENCES "eval_run_scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eval_run_scopes" ADD CONSTRAINT "eval_run_scopes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_run_scope_id_fkey" FOREIGN KEY ("run_scope_id") REFERENCES "eval_run_scopes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "job_configurations" DROP CONSTRAINT "job_configurations_run_scope_id_fkey";
ALTER TABLE "job_configurations" DROP COLUMN "run_scope_id";
