-- Add a monotonic evaluator configuration revision for deterministic eval job identities.
ALTER TABLE "job_configurations"
ADD COLUMN "job_configuration_revision" INTEGER NOT NULL DEFAULT 1;
