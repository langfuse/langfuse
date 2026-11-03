-- Topics rule of a continuous map, or the batch action of a one-off analysis. Nullable: existing runs and writers that predate the columns leave them null.
ALTER TABLE "topic_clustering_runs" ADD COLUMN "rule_id" TEXT;
ALTER TABLE "topic_clustering_runs" ADD COLUMN "batch_action_id" TEXT;

CREATE INDEX "topic_clustering_runs_rule_serving_map_idx" ON "topic_clustering_runs"("project_id", "rule_id", "facet_id", "status");
CREATE INDEX "topic_clustering_runs_project_id_batch_action_id_idx" ON "topic_clustering_runs"("project_id", "batch_action_id");
