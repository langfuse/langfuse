-- Migrate existing project retention settings to retention_configurations table
-- This migration preserves existing retention settings while enabling environment-specific retention

INSERT INTO "retention_configurations" (
    "id",
    "project_id", 
    "retention_days",
    "environments",
    "created_at",
    "updated_at"
)
SELECT 
    gen_random_uuid(),
    "id",
    "retention_days",
    ARRAY['default']::TEXT[],
    NOW(),
    NOW()
FROM "projects" 
WHERE "retention_days" IS NOT NULL 
AND "retention_days" > 0
ON CONFLICT ("project_id") DO NOTHING;

-- Note: We keep the existing retention_days column in projects table for backward compatibility
-- The application logic will prioritize retention_configurations over project-level retention
