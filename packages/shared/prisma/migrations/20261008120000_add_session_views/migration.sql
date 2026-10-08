CREATE TABLE "session_views" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    CONSTRAINT "session_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "session_views_project_id_name_key" ON "session_views"("project_id", "name");
ALTER TABLE "session_views" ADD CONSTRAINT "session_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
