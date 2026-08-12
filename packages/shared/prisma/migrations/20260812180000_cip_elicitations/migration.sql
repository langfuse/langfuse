-- CreateTable
CREATE TABLE "elicitations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "draft_fields" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elicitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elicitation_submissions" (
    "id" TEXT NOT NULL,
    "elicitation_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elicitation_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "elicitations_project_id_created_at_idx" ON "elicitations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "elicitation_submissions_elicitation_id_created_at_idx" ON "elicitation_submissions"("elicitation_id", "created_at");

-- CreateIndex
CREATE INDEX "elicitation_submissions_project_id_idx" ON "elicitation_submissions"("project_id");

-- AddForeignKey
ALTER TABLE "elicitations" ADD CONSTRAINT "elicitations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitations" ADD CONSTRAINT "elicitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elicitation_submissions" ADD CONSTRAINT "elicitation_submissions_elicitation_id_fkey" FOREIGN KEY ("elicitation_id") REFERENCES "elicitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

