-- How often each rule's maps are re-clustered. IF NOT EXISTS: databases that applied an earlier draft of 20261030120000 already have the column.
ALTER TABLE "topic_configs" ADD COLUMN IF NOT EXISTS "refit_interval_hours" INTEGER NOT NULL DEFAULT 24;
