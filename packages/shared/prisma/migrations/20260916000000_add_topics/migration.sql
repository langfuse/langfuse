-- CreateTable
CREATE TABLE "facets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facet_versions" (
    "project_id" TEXT NOT NULL,
    "facet_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facet_versions_pkey" PRIMARY KEY ("project_id", "facet_id", "version")
);

-- CreateTable
CREATE TABLE "topic_clustering_runs" (
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

    CONSTRAINT "topic_clustering_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facets_project_id_id_key" ON "facets"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "facets_project_id_name_key" ON "facets"("project_id", "name");

-- CreateIndex
CREATE INDEX "topic_clustering_runs_serving_map_idx" ON "topic_clustering_runs"("project_id", "facet_id", "status", "facet_version" DESC, "created_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "facets" ADD CONSTRAINT "facets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facet_versions" ADD CONSTRAINT "facet_versions_project_id_facet_id_fkey" FOREIGN KEY ("project_id", "facet_id") REFERENCES "facets"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_clustering_runs" ADD CONSTRAINT "topic_clustering_runs_project_id_facet_id_facet_version_fkey" FOREIGN KEY ("project_id", "facet_id", "facet_version") REFERENCES "facet_versions"("project_id", "facet_id", "version") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "facet_rules" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "sampling" TEXT NOT NULL,
    "limit" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facet_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facet_rule_assignments" (
    "project_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "facet_id" TEXT NOT NULL,

    CONSTRAINT "facet_rule_assignments_pkey" PRIMARY KEY ("rule_id", "facet_id")
);

-- CreateIndex
CREATE INDEX "facet_rules_project_id_updated_at_idx" ON "facet_rules"("project_id", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "facet_rules_project_id_id_key" ON "facet_rules"("project_id", "id");

-- CreateIndex
CREATE INDEX "facet_rule_assignments_project_id_facet_id_idx" ON "facet_rule_assignments"("project_id", "facet_id");

-- AddForeignKey
ALTER TABLE "facet_rules" ADD CONSTRAINT "facet_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facet_rule_assignments" ADD CONSTRAINT "facet_rule_assignments_project_id_rule_id_fkey" FOREIGN KEY ("project_id", "rule_id") REFERENCES "facet_rules"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facet_rule_assignments" ADD CONSTRAINT "facet_rule_assignments_project_id_facet_id_fkey" FOREIGN KEY ("project_id", "facet_id") REFERENCES "facets"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
