-- NULL marks a freshly created monitor that the scheduler should pick up on
-- its next tick. The scheduler derives the deterministic slot from the tick
-- and stamps next_run_at on first run.
ALTER TABLE "monitors" ALTER COLUMN "next_run_at" DROP NOT NULL;
