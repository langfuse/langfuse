ALTER TABLE "in_app_agent_conversations"
  ADD COLUMN "history_pruned_at" TIMESTAMP(3),
  ADD COLUMN "pruned_event_cursor" INTEGER NOT NULL DEFAULT -1;

CREATE INDEX "in_app_agent_events_project_created_at_idx"
  ON "in_app_agent_events"("project_id", "created_at");

CREATE INDEX "in_app_agent_runs_project_created_at_idx"
  ON "in_app_agent_runs"("project_id", "created_at");
