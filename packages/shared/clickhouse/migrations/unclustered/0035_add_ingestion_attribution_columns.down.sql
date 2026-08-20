ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_sdk_version
  SETTINGS alter_sync = 2;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_sdk_name
  SETTINGS alter_sync = 2;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_api_key
  SETTINGS alter_sync = 2;
