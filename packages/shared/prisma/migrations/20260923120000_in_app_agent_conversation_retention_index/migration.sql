CREATE INDEX CONCURRENTLY "in_app_agent_conversations_project_updated_at_idx"
  ON "in_app_agent_conversations"("project_id", "updated_at");
