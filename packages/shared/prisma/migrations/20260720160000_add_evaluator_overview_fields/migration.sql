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

CREATE INDEX "job_configurations_created_by_user_id_idx" ON "job_configurations"("created_by_user_id");

ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "eval_run_scopes" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
