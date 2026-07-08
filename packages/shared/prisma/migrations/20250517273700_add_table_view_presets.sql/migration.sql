-- CreateTable
CREATE TABLE "table_view_presets" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,
    "filters" JSONB NOT NULL,
    "column_order" JSONB NOT NULL,
    "column_visibility" JSONB NOT NULL,
    "search_query" TEXT,
    "order_by" JSONB,

    CONSTRAINT "table_view_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "table_view_presets_project_id_table_name_name_key" ON "table_view_presets"("project_id", "table_name", "name");

-- AddForeignKey
ALTER TABLE "table_view_presets" ADD CONSTRAINT "table_view_presets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_view_presets" ADD CONSTRAINT "table_view_presets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_view_presets" ADD CONSTRAINT "table_view_presets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;