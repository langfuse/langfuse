-- CreateTable
CREATE TABLE "event_log" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bucket_name" TEXT NOT NULL,
    "bucket_path" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,

    "trace_id" TEXT,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "event_log_project_id_entity_type_entity_id_idx" ON "event_log"("project_id", "entity_type", "entity_id");
