-- CreateTable
CREATE TABLE "issue_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issue_definition_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cta_link" TEXT,
    "priority" INTEGER NOT NULL,
    "done_at" TIMESTAMP(3),
    "ignored_at" TIMESTAMP(3),
    "ignore_reason" TEXT,

    CONSTRAINT "issue_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "issue_logs_project_id_created_at_idx" ON "issue_logs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "issue_logs_project_id_issue_definition_id_created_at_idx" ON "issue_logs"("project_id", "issue_definition_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "issue_logs" ADD CONSTRAINT "issue_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Priority ranges from 0 (highest) to 5 (lowest).
ALTER TABLE "issue_logs" ADD CONSTRAINT "issue_logs_priority_check" CHECK ("priority" BETWEEN 0 AND 5);
