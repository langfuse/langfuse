ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS ingestion_api_key String DEFAULT '';

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS langfuse_sdk_name LowCardinality(String) DEFAULT '';

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS langfuse_sdk_version LowCardinality(String) DEFAULT '';
