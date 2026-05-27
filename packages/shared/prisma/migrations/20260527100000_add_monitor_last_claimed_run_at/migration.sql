-- Wall-clock stamp written by MonitorProcessor.claim when a worker takes
-- ownership of a published run. The claim CAS uses the existing
-- last_published_run_at as the TTL anchor; this column is the per-run
-- claim discriminator so duplicate BullMQ deliveries become no-ops.
ALTER TABLE "monitors" ADD COLUMN "last_claimed_run_at" TIMESTAMP(3);
