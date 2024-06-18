-- CreateTable
CREATE TABLE "batch_exports" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "finished_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "format" TEXT NOT NULL,
    "url" TEXT,
    "log" TEXT,

    CONSTRAINT "batch_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_exports_project_id_user_id_idx" ON "batch_exports"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "batch_exports_status_idx" ON "batch_exports"("status");

-- AddForeignKey
ALTER TABLE "batch_exports" ADD CONSTRAINT "batch_exports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
