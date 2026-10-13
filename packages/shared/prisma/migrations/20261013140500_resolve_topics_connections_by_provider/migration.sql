ALTER TABLE "topic_configs"
  ADD COLUMN IF NOT EXISTS "summary_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "embedding_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "clustering_provider" TEXT;

UPDATE "topic_configs" AS config
SET "summary_provider" = connection."provider"
FROM "llm_api_keys" AS connection
WHERE config."summary_provider" IS NULL
  AND config."summary_llm_api_key_id" = connection."id";

UPDATE "topic_configs" AS config
SET "embedding_provider" = connection."provider"
FROM "llm_api_keys" AS connection
WHERE config."embedding_provider" IS NULL
  AND config."embedding_llm_api_key_id" = connection."id";

UPDATE "topic_configs" AS config
SET "clustering_provider" = connection."provider"
FROM "llm_api_keys" AS connection
WHERE config."clustering_provider" IS NULL
  AND config."clustering_llm_api_key_id" = connection."id";
