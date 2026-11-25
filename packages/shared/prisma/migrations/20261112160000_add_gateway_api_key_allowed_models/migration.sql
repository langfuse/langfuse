ALTER TABLE "gateway_api_key_associations" ADD COLUMN IF NOT EXISTS "allowed_models" JSONB;
