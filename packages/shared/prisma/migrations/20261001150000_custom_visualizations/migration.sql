CREATE TABLE "custom_visualizations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active_version_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_visualizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "custom_visualization_versions" (
    "id" TEXT NOT NULL,
    "visualization_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "prompt" TEXT,
    "model_provider" TEXT,
    "model_name" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_visualization_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_visualizations_active_version_id_key" ON "custom_visualizations"("active_version_id");
CREATE UNIQUE INDEX "custom_visualizations_id_project_id_key" ON "custom_visualizations"("id", "project_id");
CREATE INDEX "custom_visualizations_project_id_updated_at_idx" ON "custom_visualizations"("project_id", "updated_at" DESC);
CREATE UNIQUE INDEX "custom_visualization_versions_visualization_id_version_key" ON "custom_visualization_versions"("visualization_id", "version");
CREATE INDEX "custom_visualization_versions_visualization_id_created_at_idx" ON "custom_visualization_versions"("visualization_id", "created_at" DESC);

ALTER TABLE "custom_visualizations" ADD CONSTRAINT "custom_visualizations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_visualizations" ADD CONSTRAINT "custom_visualizations_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "custom_visualization_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_visualizations" ADD CONSTRAINT "custom_visualizations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "custom_visualization_versions" ADD CONSTRAINT "custom_visualization_versions_visualization_id_fkey" FOREIGN KEY ("visualization_id") REFERENCES "custom_visualizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_visualization_versions" ADD CONSTRAINT "custom_visualization_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
