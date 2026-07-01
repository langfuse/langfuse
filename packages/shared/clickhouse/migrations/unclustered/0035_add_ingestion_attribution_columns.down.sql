ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_sdk_version;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_sdk_name;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_api_key;
