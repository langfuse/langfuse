-- Creation-only Topics schema. Existing tables are validated, not upgraded.
BEGIN;

CREATE TABLE IF NOT EXISTS "topic_clustering_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "facet_id" TEXT NOT NULL,
    "facet_version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "config" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "topic_version_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "topic_clustering_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "topic_clustering_runs_project_id_facet_id_facet_version_fkey" FOREIGN KEY ("facet_id", "facet_version") REFERENCES "evaluator_versions"("evaluator_id", "version") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "topic_clustering_runs_serving_map_idx" ON "topic_clustering_runs"("project_id", "facet_id", "status", "facet_version" DESC, "created_at" DESC, "id" DESC);

COMMIT;
