CREATE TYPE "EvaluatorPurpose" AS ENUM ('EVALUATION', 'TOPICS');

ALTER TABLE "evaluators"
  ADD COLUMN "purpose" "EvaluatorPurpose" NOT NULL DEFAULT 'EVALUATION';
ALTER TABLE "evaluation_rules"
  ADD COLUMN "purpose" "EvaluatorPurpose" NOT NULL DEFAULT 'EVALUATION';

CREATE INDEX "evaluators_project_id_purpose_idx" ON "evaluators"("project_id", "purpose");
CREATE INDEX "evaluation_rules_project_id_purpose_idx" ON "evaluation_rules"("project_id", "purpose");
CREATE UNIQUE INDEX "evaluators_topics_project_name_key" ON "evaluators"("project_id", "name") WHERE "purpose" = 'TOPICS';

ALTER TABLE "evaluation_rules" ADD CONSTRAINT "evaluation_rules_topic_storage_check" CHECK (
  "purpose" <> 'TOPICS'
  OR ("status" = 'INACTIVE' AND cardinality("time_scope") = 0)
);
