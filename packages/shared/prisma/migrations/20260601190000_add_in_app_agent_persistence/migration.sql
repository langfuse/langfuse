CREATE TYPE "InAppAgentConversationVisibilityScope" AS ENUM ('PERSONAL', 'PROJECT');

CREATE TABLE "in_app_agent_conversations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "title" TEXT,
  "visibility_scope" "InAppAgentConversationVisibilityScope" NOT NULL DEFAULT 'PERSONAL',
  "provider_session_id" TEXT,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_conversations_pkey" PRIMARY KEY ("id", "project_id")
);

CREATE TABLE "in_app_agent_runs" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "triggered_by_user_id" TEXT,
  "model" TEXT,
  "mcp_api_key_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_runs_pkey" PRIMARY KEY ("id", "project_id")
);

CREATE TABLE "in_app_agent_events" (
  "project_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "event" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_events_pkey" PRIMARY KEY ("project_id", "conversation_id", "sequence_number")
);

CREATE INDEX "in_app_agent_conversations_project_user_list_idx" ON "in_app_agent_conversations"("project_id", "created_by_user_id", "deleted_at", "updated_at", "id");
CREATE INDEX "in_app_agent_runs_project_conversation_created_idx" ON "in_app_agent_runs"("project_id", "conversation_id", "created_at");

ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_conversation_id_project_id_fkey" FOREIGN KEY ("conversation_id", "project_id") REFERENCES "in_app_agent_conversations"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_events" ADD CONSTRAINT "in_app_agent_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_events" ADD CONSTRAINT "in_app_agent_events_conversation_id_project_id_fkey" FOREIGN KEY ("conversation_id", "project_id") REFERENCES "in_app_agent_conversations"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_events" ADD CONSTRAINT "in_app_agent_events_run_id_project_id_fkey" FOREIGN KEY ("run_id", "project_id") REFERENCES "in_app_agent_runs"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
