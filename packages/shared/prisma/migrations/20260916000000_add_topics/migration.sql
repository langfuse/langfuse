-- CreateTable
CREATE TABLE "topic_facets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "published_run_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topic_facets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_facet_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "facet_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "topic_facet_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_clustering_runs" (
    "execution_id" TEXT NOT NULL,
    "execution_metadata" JSONB NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "facet_version_id" TEXT NOT NULL,
    "run_sequence" BIGSERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "config" JSONB NOT NULL DEFAULT '{}',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "topic_clustering_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "topic_version_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "centroid" DOUBLE PRECISION[],
    "radius" DOUBLE PRECISION NOT NULL,
    "representative_summary_ids" TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "topics_pkey" PRIMARY KEY ("topic_version_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topic_facets_project_id_id_key" ON "topic_facets"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_facets_project_id_name_key" ON "topic_facets"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "topic_facet_versions_project_id_id_key" ON "topic_facet_versions"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "topic_facet_versions_project_id_facet_id_version_key" ON "topic_facet_versions"("project_id", "facet_id", "version");

-- CreateIndex
CREATE INDEX "topic_clustering_runs_project_id_facet_version_id_run_seque_idx" ON "topic_clustering_runs"("project_id", "facet_version_id", "run_sequence" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "topic_clustering_runs_project_id_id_key" ON "topic_clustering_runs"("project_id", "id");

-- CreateIndex
CREATE INDEX "topic_clustering_runs_project_id_execution_id_idx" ON "topic_clustering_runs"("project_id", "execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "topics_project_id_run_id_topic_id_key" ON "topics"("project_id", "run_id", "topic_id");

-- AddForeignKey
ALTER TABLE "topic_facets" ADD CONSTRAINT "topic_facets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_facet_versions" ADD CONSTRAINT "topic_facet_versions_project_id_facet_id_fkey" FOREIGN KEY ("project_id", "facet_id") REFERENCES "topic_facets"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_clustering_runs" ADD CONSTRAINT "topic_clustering_runs_project_id_facet_version_id_fkey" FOREIGN KEY ("project_id", "facet_version_id") REFERENCES "topic_facet_versions"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_project_id_run_id_fkey" FOREIGN KEY ("project_id", "run_id") REFERENCES "topic_clustering_runs"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;



-- CreateTable
CREATE TABLE "topic_rules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "sampling" TEXT NOT NULL,
    "limit" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topic_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_rule_facet_assignments" (
    "project_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "facet_id" TEXT NOT NULL,

    CONSTRAINT "topic_rule_facet_assignments_pkey" PRIMARY KEY ("rule_id", "facet_id")
);

-- CreateIndex
CREATE INDEX "topic_rules_project_id_updated_at_idx" ON "topic_rules"("project_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "topic_rules_project_id_id_key" ON "topic_rules"("project_id", "id");

-- CreateIndex
CREATE INDEX "topic_rule_facet_assignments_project_id_facet_id_idx" ON "topic_rule_facet_assignments"("project_id", "facet_id");

-- AddForeignKey
ALTER TABLE "topic_rules" ADD CONSTRAINT "topic_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_rule_facet_assignments" ADD CONSTRAINT "topic_rule_facet_assignments_project_id_rule_id_fkey" FOREIGN KEY ("project_id", "rule_id") REFERENCES "topic_rules"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_rule_facet_assignments" ADD CONSTRAINT "topic_rule_facet_assignments_project_id_facet_id_fkey" FOREIGN KEY ("project_id", "facet_id") REFERENCES "topic_facets"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
