ALTER TYPE "GatewayProvider" ADD VALUE IF NOT EXISTS 'bedrock';

ALTER TABLE "gateway_ai_connections" ADD COLUMN "config" JSONB;
