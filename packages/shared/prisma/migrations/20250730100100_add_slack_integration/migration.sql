-- Migration: Add Slack Integration Support
-- This migration adds support for Slack automation actions by:
-- 1. Adding SLACK to the ActionType enum
-- 2. Creating slack_integrations table for centralized token storage

-- AlterEnum
ALTER TYPE "ActionType" ADD VALUE 'SLACK';

-- CreateTable
CREATE TABLE "slack_integrations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "bot_token" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_integrations_project_id_key" ON "slack_integrations"("project_id");

-- CreateIndex
CREATE INDEX "slack_integrations_team_id_idx" ON "slack_integrations"("team_id");

-- AddForeignKey
ALTER TABLE "slack_integrations" ADD CONSTRAINT "slack_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE; 