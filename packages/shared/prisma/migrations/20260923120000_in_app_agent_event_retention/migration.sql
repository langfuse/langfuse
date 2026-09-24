ALTER TABLE "in_app_agent_conversations"
  ADD COLUMN "history_pruned_at" TIMESTAMP(3),
  ADD COLUMN "pruned_event_cursor" INTEGER NOT NULL DEFAULT -1;
