-- CreateEnum
CREATE TYPE "InAppAgentRoutineStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "in_app_agent_routines" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "InAppAgentRoutineStatus" NOT NULL DEFAULT 'PAUSED',
    "cron" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_fired_at" TIMESTAMP(3),
    "last_conversation_id" TEXT,
    "last_skip_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_agent_routines_pkey" PRIMARY KEY ("id","project_id")
);

-- AlterTable
ALTER TABLE "in_app_agent_conversations" ADD COLUMN "routine_id" TEXT;

-- CreateIndex
CREATE INDEX "in_app_agent_routines_status_next_run_at_idx" ON "in_app_agent_routines"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "in_app_agent_routines_project_user_idx" ON "in_app_agent_routines"("project_id", "created_by_user_id");

-- CreateIndex
CREATE INDEX "in_app_agent_conversations_project_routine_idx" ON "in_app_agent_conversations"("project_id", "routine_id");

-- AddForeignKey
ALTER TABLE "in_app_agent_routines" ADD CONSTRAINT "in_app_agent_routines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_routines" ADD CONSTRAINT "in_app_agent_routines_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_routine_id_project_id_fkey" FOREIGN KEY ("routine_id", "project_id") REFERENCES "in_app_agent_routines"("id", "project_id") ON DELETE SET NULL ON UPDATE CASCADE;
