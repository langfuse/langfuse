-- Add filter_target column to job_configurations
-- filter_target determines what triggers the eval ('trace', 'dataset', or 'observation')
-- while target_object determines what gets scored

-- Add filter_target column (nullable initially for migration)
ALTER TABLE "job_configurations" ADD COLUMN "filter_target" TEXT;

-- Migrate existing records:
-- If target_object is 'dataset', filter_target is 'dataset'
-- Otherwise, filter_target is 'trace'
UPDATE "job_configurations"
SET "filter_target" = CASE
  WHEN "target_object" = 'dataset' THEN 'dataset'
  ELSE 'trace'
END;

-- Make column non-nullable after migration
ALTER TABLE "job_configurations" ALTER COLUMN "filter_target" SET NOT NULL;

-- Add index for efficient filtering by project, filter_target, and status
CREATE INDEX IF NOT EXISTS "job_configurations_project_id_filter_target_status_idx"
ON "job_configurations"("project_id", "filter_target", "status");
