CREATE TYPE "InAppAgentConversationVisibility" AS ENUM ('PRIVATE', 'PROJECT');

CREATE TYPE "InAppAgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL', 'ACTIVITY', 'REASONING');

CREATE TYPE "InAppAgentMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TYPE "InAppAgentRunStatus" AS ENUM ('PENDING', 'RUNNING', 'AWAITING_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT');

CREATE TYPE "InAppAgentRunTrigger" AS ENUM ('USER_MESSAGE', 'BACKGROUND');

CREATE TYPE "InAppAgentConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'CANCELLED');

CREATE TYPE "InAppAgentConfirmationSeverity" AS ENUM ('INFO', 'WARNING', 'DANGER');

CREATE TABLE "in_app_agent_conversations" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "title" TEXT,
  "visibility" "InAppAgentConversationVisibility" NOT NULL DEFAULT 'PRIVATE',
  "provider" TEXT NOT NULL DEFAULT 'anthropic',
  "provider_session_id" TEXT,
  "last_message_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
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
  "status" "InAppAgentRunStatus" NOT NULL DEFAULT 'PENDING',
  "trigger" "InAppAgentRunTrigger" NOT NULL DEFAULT 'USER_MESSAGE',
  "model_provider" TEXT,
  "model" TEXT,
  "model_params" JSONB,
  "agent_version" TEXT,
  "prompt_versions" JSONB,
  "allowed_tools" JSONB,
  "mcp_api_key_id" TEXT,
  "provider_session_id" TEXT,
  "internal_trace_id" TEXT,
  "usage" JSONB,
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
  "text" TEXT,
  "status" "InAppAgentMessageStatus" NOT NULL DEFAULT 'COMPLETED',
  "author_user_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_agent_confirmation_requests" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "run_id" TEXT,
  "message_id" TEXT,
  "created_by_user_id" TEXT,
  "status" "InAppAgentConfirmationStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "severity" "InAppAgentConfirmationSeverity" NOT NULL DEFAULT 'INFO',
  "options" JSONB,
  "proposed_action" JSONB,
  "proposed_action_hash" TEXT,
  "response" JSONB,
  "responded_by_user_id" TEXT,
  "responded_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_confirmation_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_agent_credential_leases" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "run_id" TEXT,
  "created_by_user_id" TEXT,
  "api_key_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "in_app_agent_credential_leases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "in_app_agent_messages_project_id_conversation_id_external_id_key" ON "in_app_agent_messages"("project_id", "conversation_id", "external_id");

CREATE INDEX "in_app_agent_conversations_project_id_created_by_user_id_deleted_at_last_message_at_idx" ON "in_app_agent_conversations"("project_id", "created_by_user_id", "deleted_at", "last_message_at");
CREATE INDEX "in_app_agent_conversations_project_id_updated_at_idx" ON "in_app_agent_conversations"("project_id", "updated_at");
CREATE INDEX "in_app_agent_messages_project_id_conversation_id_sequence_number_idx" ON "in_app_agent_messages"("project_id", "conversation_id", "sequence_number");
CREATE INDEX "in_app_agent_messages_project_id_created_at_idx" ON "in_app_agent_messages"("project_id", "created_at");
CREATE INDEX "in_app_agent_messages_run_id_idx" ON "in_app_agent_messages"("run_id");
CREATE INDEX "in_app_agent_runs_project_id_conversation_id_created_at_idx" ON "in_app_agent_runs"("project_id", "conversation_id", "created_at");
CREATE INDEX "in_app_agent_runs_project_id_created_by_user_id_created_at_idx" ON "in_app_agent_runs"("project_id", "created_by_user_id", "created_at");
CREATE INDEX "in_app_agent_runs_project_id_status_created_at_idx" ON "in_app_agent_runs"("project_id", "status", "created_at");
CREATE INDEX "in_app_agent_confirmation_requests_project_id_conversation_id_created_at_idx" ON "in_app_agent_confirmation_requests"("project_id", "conversation_id", "created_at");
CREATE INDEX "in_app_agent_confirmation_requests_project_id_run_id_status_idx" ON "in_app_agent_confirmation_requests"("project_id", "run_id", "status");
CREATE INDEX "in_app_agent_confirmation_requests_project_id_status_expires_at_idx" ON "in_app_agent_confirmation_requests"("project_id", "status", "expires_at");
CREATE INDEX "in_app_agent_credential_leases_project_id_conversation_id_expires_at_idx" ON "in_app_agent_credential_leases"("project_id", "conversation_id", "expires_at");
CREATE INDEX "in_app_agent_credential_leases_api_key_id_idx" ON "in_app_agent_credential_leases"("api_key_id");

ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_conversations" ADD CONSTRAINT "in_app_agent_conversations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "in_app_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_runs" ADD CONSTRAINT "in_app_agent_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "in_app_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "in_app_agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_messages" ADD CONSTRAINT "in_app_agent_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_confirmation_requests" ADD CONSTRAINT "in_app_agent_confirmation_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_confirmation_requests" ADD CONSTRAINT "in_app_agent_confirmation_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "in_app_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_confirmation_requests" ADD CONSTRAINT "in_app_agent_confirmation_requests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "in_app_agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_confirmation_requests" ADD CONSTRAINT "in_app_agent_confirmation_requests_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "in_app_agent_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_confirmation_requests" ADD CONSTRAINT "in_app_agent_confirmation_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_confirmation_requests" ADD CONSTRAINT "in_app_agent_confirmation_requests_responded_by_user_id_fkey" FOREIGN KEY ("responded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_agent_credential_leases" ADD CONSTRAINT "in_app_agent_credential_leases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_credential_leases" ADD CONSTRAINT "in_app_agent_credential_leases_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "in_app_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_credential_leases" ADD CONSTRAINT "in_app_agent_credential_leases_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "in_app_agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_credential_leases" ADD CONSTRAINT "in_app_agent_credential_leases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_agent_credential_leases" ADD CONSTRAINT "in_app_agent_credential_leases_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
