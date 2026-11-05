ALTER TYPE "GatewayProvider" ADD VALUE IF NOT EXISTS 'bedrock';

ALTER TABLE "gateway_ai_connections" ADD COLUMN IF NOT EXISTS "config" JSONB;

ALTER TABLE "gateway_ai_connections" ADD COLUMN IF NOT EXISTS "custom_models" JSONB NOT NULL DEFAULT '[]';
