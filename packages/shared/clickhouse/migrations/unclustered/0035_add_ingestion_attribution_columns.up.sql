ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS ingestion_api_key String DEFAULT ''
  SETTINGS alter_sync = 2;

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS ingestion_sdk_name LowCardinality(String) DEFAULT 'unknown'
  SETTINGS alter_sync = 2;

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS ingestion_sdk_version LowCardinality(String) DEFAULT 'unknown'
  SETTINGS alter_sync = 2;
