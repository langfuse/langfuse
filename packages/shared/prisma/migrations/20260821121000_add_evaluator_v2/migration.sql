-- Prisma does not automatically wrap PostgreSQL migrations in a transaction.
BEGIN;

-- DDL only. The backfill that copies job_configurations/eval_templates into these tables lives in
-- the follow-up migration 20260821121500_backfill_evaluator_v2 and must stay there.
--
-- Adding a foreign key takes SHARE ROW EXCLUSIVE on the *referenced* table, which conflicts with
-- the ROW EXCLUSIVE that every INSERT/UPDATE/DELETE takes. The FKs below reference `projects` and
-- `users`, so for as long as this transaction is open, all writes to those two tables block --
-- including unrelated hot paths such as persistProjectHasTracesFlag. Keeping the backfill out of
-- this transaction bounds that window to the DDL itself, which is milliseconds because every
-- referencing table is created empty a few lines above its FK.
--
-- The timeouts make that bound explicit: if an in-flight writer on `projects` delays us, we fail
-- fast instead of parking a SHARE ROW EXCLUSIVE request at the head of the lock queue, where every
-- subsequent writer would pile up behind it.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE "EvaluatorSourceCodeLanguage" AS ENUM ('PYTHON', 'TYPESCRIPT');

CREATE TABLE "evaluators" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "EvalTemplateType" NOT NULL,
  "description" TEXT,
  "created_by_user_id" TEXT,
  "blocked_at" TIMESTAMP(3),
  "block_reason" "EvaluatorBlockReason",
  "block_message" TEXT,

  CONSTRAINT "evaluators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluators"
  ADD CONSTRAINT "evaluators_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluators"
  ADD CONSTRAINT "evaluators_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "evaluators_project_id_created_at_idx" ON "evaluators"("project_id", "created_at" DESC);

CREATE TABLE "evaluator_versions" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evaluator_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "created_by_user_id" TEXT,
  "prompt" TEXT,
  "partner" TEXT,
  "model" TEXT,
  "provider" TEXT,
  "model_params" JSONB,
  "vars" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "variable_mapping" JSONB,
  "output_definition" JSONB,
  "source_code" VARCHAR(262144),
  "source_code_language" "EvaluatorSourceCodeLanguage",

  CONSTRAINT "evaluator_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluator_versions"
  ADD CONSTRAINT "evaluator_versions_evaluator_id_fkey"
  FOREIGN KEY ("evaluator_id") REFERENCES "evaluators"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluator_versions"
  ADD CONSTRAINT "evaluator_versions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "evaluator_versions_evaluator_id_version_key" ON "evaluator_versions"("evaluator_id", "version" DESC);

CREATE TABLE "evaluation_rules" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "name" TEXT NOT NULL,
  "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE',
  "target_object" TEXT NOT NULL,
  "filter" JSONB NOT NULL,
  "sampling" DECIMAL(65,30) NOT NULL,
  "delay" INTEGER NOT NULL,
  "time_scope" TEXT[] NOT NULL DEFAULT ARRAY['NEW']::TEXT[],

  CONSTRAINT "evaluation_rules_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluation_rules"
  ADD CONSTRAINT "evaluation_rules_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_rules"
  ADD CONSTRAINT "evaluation_rules_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "evaluation_rules_project_id_updated_at_idx" ON "evaluation_rules"("project_id", "updated_at" DESC);

CREATE TABLE "evaluation_rule_evaluator_assignments" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "project_id" TEXT NOT NULL,
  "evaluation_rule_id" TEXT NOT NULL,
  "evaluator_id" TEXT NOT NULL,
  "variable_mapping" JSONB,

  CONSTRAINT "evaluation_rule_evaluator_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluation_rule_evaluator_assignments"
  ADD CONSTRAINT "evaluation_rule_evaluator_assignments_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_rule_evaluator_assignments"
  ADD CONSTRAINT "evaluation_rule_evaluator_assignments_evaluation_rule_id_fkey"
  FOREIGN KEY ("evaluation_rule_id") REFERENCES "evaluation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_rule_evaluator_assignments"
  ADD CONSTRAINT "evaluation_rule_evaluator_assignments_evaluator_id_fkey"
  FOREIGN KEY ("evaluator_id") REFERENCES "evaluators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "evaluation_rule_assignments_rule_evaluator_key"
  ON "evaluation_rule_evaluator_assignments"("evaluation_rule_id", "evaluator_id");
-- for efficient project deletes
CREATE INDEX "evaluation_rule_assignments_project_id_idx"
  ON "evaluation_rule_evaluator_assignments"("project_id");
CREATE INDEX "evaluation_rule_assignments_evaluator_id_idx"
  ON "evaluation_rule_evaluator_assignments"("evaluator_id");

COMMIT;
