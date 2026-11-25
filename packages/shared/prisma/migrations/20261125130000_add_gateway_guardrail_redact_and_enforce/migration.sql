ALTER TYPE "GatewayGuardrailAction" ADD VALUE IF NOT EXISTS 'ENFORCE';

ALTER TABLE "gateway_guardrails" ADD COLUMN IF NOT EXISTS "redaction_label" TEXT;
