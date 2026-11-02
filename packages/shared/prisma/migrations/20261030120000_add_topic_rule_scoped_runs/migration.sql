-- Topic maps belong to a Topics rule (continuous) or to a one-off analysis execution.
-- Existing runs keep both columns null and stay attributed to the project's oldest rule.
ALTER TABLE "topic_clustering_runs" ADD COLUMN "rule_id" TEXT;
ALTER TABLE "topic_clustering_runs" ADD COLUMN "batch_action_id" TEXT;

CREATE INDEX "topic_clustering_runs_rule_serving_map_idx" ON "topic_clustering_runs"("project_id", "rule_id", "facet_id", "status");
CREATE INDEX "topic_clustering_runs_project_id_batch_action_id_idx" ON "topic_clustering_runs"("project_id", "batch_action_id");
