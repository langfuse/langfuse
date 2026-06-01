CREATE TYPE "InAppAgentConversationVisibilityScope" AS ENUM ('PERSONAL', 'PROJECT');

CREATE TYPE "InAppAgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL', 'ACTIVITY', 'REASONING');

CREATE TABLE "in_app_agent_conversations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "title" TEXT,
  "visibility_scope" "InAppAgentConversationVisibilityScope" NOT NULL DEFAULT 'PERSONAL',
  "provider_session_id" TEXT,
  "last_message_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_agent_runs" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "model" TEXT,
  "model_params" JSONB,
  "mcp_api_key_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_agent_messages" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "run_id" TEXT,
  "external_id" TEXT NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "role" "InAppAgentMessageRole" NOT NULL,
  "content" JSONB NOT NULL,
  "author_user_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "in_app_agent_messages_project_id_conversation_id_external_id_key" ON "in_app_agent_messages"("project_id", "conversation_id", "external_id");

CREATE INDEX "in_app_agent_conversations_project_id_created_by_user_id_deleted_at_last_message_at_idx" ON "in_app_agent_conversations"("project_id", "created_by_user_id", "deleted_at", "last_message_at");
CREATE INDEX "in_app_agent_conversations_project_id_updated_at_idx" ON "in_app_agent_conversations"("project_id", "updated_at");
CREATE INDEX "in_app_agent_messages_project_id_conversation_id_sequence_number_idx" ON "in_app_agent_messages"("project_id", "conversation_id", "sequence_number");
CREATE INDEX "in_app_agent_messages_project_id_created_at_idx" ON "in_app_agent_messages"("project_id", "created_at");
CREATE INDEX "in_app_agent_messages_run_id_idx" ON "in_app_agent_messages"("run_id");
CREATE INDEX "in_app_agent_runs_project_id_conversation_id_created_at_idx" ON "in_app_agent_runs"("project_id", "conversation_id", "created_at");
CREATE INDEX "in_app_agent_runs_project_id_created_by_user_id_created_at_idx" ON "in_app_agent_runs"("project_id", "created_by_user_id", "created_at");

ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "in_app_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "in_app_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "in_app_agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
