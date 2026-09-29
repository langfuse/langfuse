-- CreateTable
CREATE TABLE "in_app_agent_pending_tool_approvals" (
    "project_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tool_call_id" TEXT NOT NULL,
    "approval_fingerprint" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_agent_pending_tool_approvals_pkey" PRIMARY KEY ("project_id","conversation_id","tool_call_id")
);

-- CreateIndex
CREATE INDEX "in_app_agent_pending_tool_approvals_expires_at_idx" ON "in_app_agent_pending_tool_approvals"("expires_at");

-- AddForeignKey
ALTER TABLE "in_app_agent_pending_tool_approvals" ADD CONSTRAINT "in_app_agent_pending_tool_approvals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_pending_tool_approvals" ADD CONSTRAINT "in_app_agent_pending_tool_approvals_conversation_id_projec_fkey" FOREIGN KEY ("conversation_id", "project_id") REFERENCES "in_app_agent_conversations"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
