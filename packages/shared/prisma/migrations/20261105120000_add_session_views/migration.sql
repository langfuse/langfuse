CREATE TYPE "SessionViewMode" AS ENUM ('conversational', 'list');
CREATE TYPE "SessionUnmatchedTraces" AS ENUM ('show', 'hide');

CREATE TABLE "session_views" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "view_mode" "SessionViewMode" NOT NULL,
    "unmatched_traces" "SessionUnmatchedTraces" NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_table_view_preset_id" TEXT,
    CONSTRAINT "session_views_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "session_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_views_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "session_views_project_id_name_key" ON "session_views"("project_id", "name");
CREATE UNIQUE INDEX "session_views_source_table_view_preset_id_key" ON "session_views"("source_table_view_preset_id");

CREATE TABLE "session_view_preferences" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "unpinned_view_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "view_order" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "session_view_preferences_pkey" PRIMARY KEY ("project_id", "user_id"),
    CONSTRAINT "session_view_preferences_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "session_view_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Keep IDs and original rows intact for existing references and legacy clients.
INSERT INTO "session_views" (
    "id", "project_id", "name", "filters", "view_mode", "unmatched_traces",
    "created_by", "created_at", "updated_at", "source_table_view_preset_id"
)
SELECT "id", "project_id", "name", "filters", 'list', 'hide',
       "created_by", "created_at", "updated_at", "id"
FROM "table_view_presets"
WHERE "table_name" = 'session-detail';
