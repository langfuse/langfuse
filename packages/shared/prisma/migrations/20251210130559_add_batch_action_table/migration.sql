-- CreateTable
CREATE TABLE "batch_actions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finished_at" TIMESTAMP(3),
    "query" JSONB NOT NULL,
    "config" JSONB,
    "total_count" INTEGER,
    "processed_count" INTEGER,
    "failed_count" INTEGER,
    "log" TEXT,

    CONSTRAINT "batch_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_actions_project_id_user_id_idx" ON "batch_actions"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "batch_actions_status_idx" ON "batch_actions"("status");

-- CreateIndex
CREATE INDEX "batch_actions_project_id_action_type_idx" ON "batch_actions"("project_id", "action_type");

-- AddForeignKey
ALTER TABLE "batch_actions" ADD CONSTRAINT "batch_actions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
