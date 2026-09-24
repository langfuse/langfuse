CREATE INDEX CONCURRENTLY "in_app_agent_runs_project_created_at_idx"
  ON "in_app_agent_runs"("project_id", "created_at");
