CREATE INDEX CONCURRENTLY "in_app_agent_events_project_created_at_idx"
  ON "in_app_agent_events"("project_id", "created_at");
