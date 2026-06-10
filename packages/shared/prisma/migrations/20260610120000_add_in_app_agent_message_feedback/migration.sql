-- CreateTable
CREATE TABLE "in_app_agent_message_feedback" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "value" BOOLEAN NOT NULL,
    "comment" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_agent_message_feedback_pkey" PRIMARY KEY ("id", "project_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "in_app_agent_feedback_project_conversation_message_user_key" ON "in_app_agent_message_feedback"("project_id", "conversation_id", "message_id", "created_by_user_id");

-- CreateIndex
CREATE INDEX "in_app_agent_message_feedback_project_conversation_idx" ON "in_app_agent_message_feedback"("project_id", "conversation_id");

-- AddForeignKey
ALTER TABLE "in_app_agent_message_feedback" ADD CONSTRAINT "in_app_agent_message_feedback_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_message_feedback" ADD CONSTRAINT "in_app_agent_message_feedback_conversation_id_project_id_fkey" FOREIGN KEY ("conversation_id", "project_id") REFERENCES "in_app_agent_conversations"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_agent_message_feedback" ADD CONSTRAINT "in_app_agent_message_feedback_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
