ALTER TABLE "evaluation_rules"
ADD COLUMN "trigger_evaluator_id" TEXT,
ADD COLUMN "score_result_predicates" JSONB,
ADD COLUMN "trigger_invalid_reason" TEXT;

ALTER TABLE "evaluation_rules"
ADD CONSTRAINT "evaluation_rules_trigger_evaluator_id_fkey"
FOREIGN KEY ("trigger_evaluator_id") REFERENCES "evaluators"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "evaluation_rules_project_id_target_object_trigger_evaluator_id_idx"
ON "evaluation_rules"("project_id", "target_object", "trigger_evaluator_id");
