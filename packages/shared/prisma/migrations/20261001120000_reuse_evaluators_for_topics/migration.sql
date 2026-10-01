CREATE TYPE "EvaluatorPurpose" AS ENUM ('EVALUATION', 'TOPICS');

ALTER TABLE "evaluators"
  ADD COLUMN "purpose" "EvaluatorPurpose" NOT NULL DEFAULT 'EVALUATION';
ALTER TABLE "evaluation_rules"
  ADD COLUMN "purpose" "EvaluatorPurpose" NOT NULL DEFAULT 'EVALUATION',
  ADD COLUMN "topic_selection_strategy" TEXT,
  ADD COLUMN "topic_selection_limit" INTEGER;

CREATE INDEX "evaluators_project_id_purpose_idx" ON "evaluators"("project_id", "purpose");
CREATE INDEX "evaluation_rules_project_id_purpose_idx" ON "evaluation_rules"("project_id", "purpose");
CREATE UNIQUE INDEX "evaluators_topics_project_name_key" ON "evaluators"("project_id", "name") WHERE "purpose" = 'TOPICS';

ALTER TABLE "evaluation_rules" ADD CONSTRAINT "evaluation_rules_topic_storage_check" CHECK (
  ("purpose" = 'EVALUATION' AND "topic_selection_strategy" IS NULL AND "topic_selection_limit" IS NULL)
  OR
  ("purpose" = 'TOPICS' AND "topic_selection_strategy" IN ('random', 'latest')
    AND ("topic_selection_limit" IS NULL OR "topic_selection_limit" > 0)
    AND "status" = 'INACTIVE' AND cardinality("time_scope") = 0)
);
