-- CreateTable
CREATE TABLE "tracing_readiness_settings" (
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_by" TEXT,
    "trace_idle_ms" INTEGER,

    CONSTRAINT "tracing_readiness_settings_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "tracing_readiness_settings" ADD CONSTRAINT "tracing_readiness_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracing_readiness_settings" ADD CONSTRAINT "tracing_readiness_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracing_readiness_settings" ADD CONSTRAINT "tracing_readiness_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
