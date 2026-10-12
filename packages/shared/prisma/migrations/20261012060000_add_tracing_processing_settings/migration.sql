-- CreateTable
CREATE TABLE "tracing_processing_settings" (
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trace_idle_ms" INTEGER,

    CONSTRAINT "tracing_processing_settings_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "tracing_processing_settings" ADD CONSTRAINT "tracing_processing_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
