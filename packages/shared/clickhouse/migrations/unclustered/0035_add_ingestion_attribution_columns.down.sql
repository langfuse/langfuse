ALTER TABLE scores
  DROP COLUMN IF EXISTS langfuse_sdk_version;

ALTER TABLE scores
  DROP COLUMN IF EXISTS langfuse_sdk_name;

ALTER TABLE scores
  DROP COLUMN IF EXISTS ingestion_api_key;
