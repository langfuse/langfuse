ALTER TYPE "GatewayGuardrailType" ADD VALUE IF NOT EXISTS 'BEDROCK';

ALTER TABLE "gateway_guardrails" ADD COLUMN IF NOT EXISTS "encrypted_credentials" TEXT;
