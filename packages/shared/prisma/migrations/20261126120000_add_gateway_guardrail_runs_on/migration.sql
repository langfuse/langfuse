DO $$ BEGIN
  CREATE TYPE "GatewayGuardrailRunsOn" AS ENUM ('INPUT', 'OUTPUT', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "gateway_guardrails" ADD COLUMN IF NOT EXISTS "runs_on" "GatewayGuardrailRunsOn" NOT NULL DEFAULT 'INPUT';
