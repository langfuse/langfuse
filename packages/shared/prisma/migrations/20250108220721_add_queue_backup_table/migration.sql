-- CreateTable
CREATE TABLE "queue_backups" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "queue_name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_backups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "traces" ADD CONSTRAINT "traces_session_id_project_id_fkey" FOREIGN KEY ("session_id", "project_id") REFERENCES "trace_sessions"("id", "project_id") ON DELETE RESTRICT ON UPDATE CASCADE;
