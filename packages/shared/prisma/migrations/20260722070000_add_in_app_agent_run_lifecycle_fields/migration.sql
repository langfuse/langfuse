-- Expand step of an expand/contract rollout (contract lands with the first
-- status reader, which backfills remaining NULLs and sets DEFAULT/NOT NULL —
-- see the add_project_id_to_observations precedent). All columns are nullable
-- so replicas that predate this code keep inserting successfully; a NULL
-- status means "row written by old code".
ALTER TABLE "in_app_agent_runs"
  ADD COLUMN "status" TEXT,
  ADD COLUMN "request" JSONB,
  ADD COLUMN "claimed_at" TIMESTAMP(3),
  ADD COLUMN "heartbeat_at" TIMESTAMP(3),
  ADD COLUMN "cancel_requested_at" TIMESTAMP(3);

-- Close only runs the app itself would already consider stale (>150s,
-- ACTIVE_RUN_STALE_AFTER_MS in web/src/ee/features/in-app-agent/server/persistence.ts).
-- Younger unfinished rows are genuinely running foreground streams and must
-- stay open, or their event flushes and finish would silently no-op.
UPDATE "in_app_agent_runs"
SET "finished_at" = NOW(),
    "error_code" = 'stale',
    "error_message" = 'Run was marked stale before starting a new run'
WHERE "finished_at" IS NULL
  AND "created_at" < NOW() - INTERVAL '150 seconds';

-- Single-active-run backstop for background execution. The app invariant
-- (stale-close before create, under the conversation row lock) already
-- guarantees at most one unfinished run per conversation, so this creates
-- cleanly even with live runs left open.
CREATE UNIQUE INDEX "in_app_agent_runs_active_conversation_key"
  ON "in_app_agent_runs" ("project_id", "conversation_id")
  WHERE "finished_at" IS NULL;
