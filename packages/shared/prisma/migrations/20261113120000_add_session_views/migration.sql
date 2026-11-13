-- CreateEnum
CREATE TYPE "SessionViewMode" AS ENUM ('conversational', 'list');

-- CreateEnum
CREATE TYPE "SessionUnmatchedTraces" AS ENUM ('show', 'hide');

-- CreateTable
CREATE TABLE "session_views" (
    "is_pinned_by_default_for_project" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "view_mode" "SessionViewMode" NOT NULL,
    "unmatched_traces" "SessionUnmatchedTraces" NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_view_pin_overrides" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "view_id" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "session_view_pin_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_views_project_id_name_key" ON "session_views"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "session_views_project_id_id_key" ON "session_views"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "session_view_pin_overrides_project_id_user_id_view_id_key" ON "session_view_pin_overrides"("project_id", "user_id", "view_id");

-- Null view_id identifies the built-in Messages view.
CREATE UNIQUE INDEX "session_view_pin_overrides_messages_key" ON "session_view_pin_overrides"("project_id", "user_id") WHERE "view_id" IS NULL;

-- CreateIndex
CREATE INDEX "session_view_pin_overrides_user_id_idx" ON "session_view_pin_overrides"("user_id");

-- CreateIndex
CREATE INDEX "session_view_pin_overrides_project_id_view_id_idx" ON "session_view_pin_overrides"("project_id", "view_id");

-- AddForeignKey
ALTER TABLE "session_views" ADD CONSTRAINT "session_views_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_views" ADD CONSTRAINT "session_views_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_view_pin_overrides" ADD CONSTRAINT "session_view_pin_overrides_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_view_pin_overrides" ADD CONSTRAINT "session_view_pin_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_view_pin_overrides" ADD CONSTRAINT "session_view_pin_overrides_project_id_view_id_fkey" FOREIGN KEY ("project_id", "view_id") REFERENCES "session_views"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
