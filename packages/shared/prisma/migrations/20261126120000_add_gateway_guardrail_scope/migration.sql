DO $$ BEGIN
  CREATE TYPE "GatewayGuardrailScope" AS ENUM ('LAST_TURN', 'ENTIRE_INPUT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "gateway_guardrails"
  ADD COLUMN IF NOT EXISTS "scope" "GatewayGuardrailScope" NOT NULL DEFAULT 'LAST_TURN';
