-- CreateTable
CREATE TABLE "in_app_agent_script_executions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "parent_run_id" TEXT NOT NULL,
    "waiting_run_id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "script_digest" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "model_binding" JSONB,
    "limits" JSONB NOT NULL,
    "provider_session_id" TEXT,
    "admitted_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "deadline_at" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "output" TEXT,
    "output_cursor" INTEGER NOT NULL DEFAULT 0,
    "exit_code" INTEGER,
    "error_message" TEXT,
    "result_summary" JSONB,
    "credential_id" TEXT NOT NULL,
    "token_digest" TEXT NOT NULL,
    "token_revoked_at" TIMESTAMP(3),
    "sdk_request_count" INTEGER NOT NULL DEFAULT 0,
    "model_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "ingestion_event_count" INTEGER NOT NULL DEFAULT 0,
    "continuation_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_agent_script_executions_pkey" PRIMARY KEY ("id","project_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "in_app_agent_script_executions_credential_id_key" ON "in_app_agent_script_executions"("credential_id");

-- CreateIndex
CREATE UNIQUE INDEX "in_app_agent_script_executions_project_id_conversation_id_tool_call_id_key" ON "in_app_agent_script_executions"("project_id", "conversation_id", "tool_call_id");

-- CreateIndex
CREATE INDEX "in_app_agent_script_executions_state_deadline_idx" ON "in_app_agent_script_executions"("state", "deadline_at");

-- CreateIndex
CREATE INDEX "in_app_agent_script_executions_conversation_idx" ON "in_app_agent_script_executions"("project_id", "conversation_id");

-- AddForeignKey
ALTER TABLE "in_app_agent_script_executions" ADD CONSTRAINT "in_app_agent_script_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_script_executions" ADD CONSTRAINT "in_app_agent_script_executions_conversation_id_project_id_fkey" FOREIGN KEY ("conversation_id", "project_id") REFERENCES "in_app_agent_conversations"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_script_executions" ADD CONSTRAINT "in_app_agent_script_executions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
