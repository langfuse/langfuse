ALTER TABLE observations
  DROP COLUMN IF EXISTS ingestion_sdk_version;

ALTER TABLE observations
  DROP COLUMN IF EXISTS ingestion_sdk_name;

ALTER TABLE observations
  DROP COLUMN IF EXISTS ingestion_api_key;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_sdk_version;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_sdk_name;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_api_key;
