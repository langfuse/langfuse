ALTER TABLE "monitors" ALTER COLUMN "next_run_at" DROP NOT NULL;

ALTER TABLE "monitors" RENAME COLUMN "last_published_run_at" TO "last_published_at";

ALTER TABLE "monitors" RENAME COLUMN "last_completed_run_at" TO "last_completed_at";

ALTER TABLE "monitors" ADD COLUMN "last_claimed_at" TIMESTAMP(3);

CREATE INDEX "monitors_scheduler_rescue_idx" ON "monitors"("last_published_at")
  WHERE "last_completed_at" IS NULL OR "last_completed_at" < "last_published_at";
