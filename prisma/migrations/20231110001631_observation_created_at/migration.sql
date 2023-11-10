-- Create column
ALTER TABLE "observations" ADD COLUMN "created_at" TIMESTAMP(3);

-- Backfill column, set to start_time
UPDATE "observations" SET "created_at" = "start_time";

-- Set default value
ALTER TABLE "observations" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Add not null constraint
ALTER TABLE "observations" ALTER COLUMN "created_at" SET NOT NULL;
