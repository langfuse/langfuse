CREATE TYPE "EvaluationRuleTriggerKind" AS ENUM ('OBSERVATION', 'SCORE_RESULT');

ALTER TABLE "evaluation_rules"
ADD COLUMN "trigger_kind" "EvaluationRuleTriggerKind" NOT NULL DEFAULT 'OBSERVATION',
ADD COLUMN "trigger_evaluator_id" TEXT,
ADD COLUMN "score_result_predicates" JSONB,
ADD COLUMN "trigger_invalid_reason" TEXT;

ALTER TABLE "evaluation_rules"
ADD CONSTRAINT "evaluation_rules_trigger_evaluator_id_fkey"
FOREIGN KEY ("trigger_evaluator_id") REFERENCES "evaluators"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "evaluation_rules_project_id_trigger_kind_trigger_evaluator_id_idx"
ON "evaluation_rules"("project_id", "trigger_kind", "trigger_evaluator_id");
