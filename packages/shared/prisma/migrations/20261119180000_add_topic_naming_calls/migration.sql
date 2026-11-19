CREATE TABLE "topic_naming_calls" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "run_id" TEXT NOT NULL REFERENCES "topic_clustering_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "cost_usd" DECIMAL(65,30)
);

CREATE INDEX "topic_naming_calls_run_id_idx" ON "topic_naming_calls"("run_id");
