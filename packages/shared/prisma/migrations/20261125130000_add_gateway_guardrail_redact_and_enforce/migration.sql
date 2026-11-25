-- Add ENFORCE to GatewayGuardrailAction, backfill existing Bedrock rows from
-- BLOCK/REDACT to ENFORCE, and add redaction_label.
-- Recreates the enum when ENFORCE is absent so the backfill can reference it
-- in the same transaction (Postgres otherwise rejects using a newly-added
-- enum value in the same transaction).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema()
      AND t.typname = 'GatewayGuardrailAction'
      AND e.enumlabel = 'ENFORCE'
  ) THEN
    ALTER TYPE "GatewayGuardrailAction" RENAME TO "GatewayGuardrailAction_old";

    CREATE TYPE "GatewayGuardrailAction" AS ENUM (
      'BLOCK',
      'LOG',
      'REDACT',
      'ENFORCE'
    );

    ALTER TABLE "gateway_guardrails"
      ALTER COLUMN "action" TYPE "GatewayGuardrailAction"
        USING "action"::text::"GatewayGuardrailAction";

    DROP TYPE "GatewayGuardrailAction_old";
  END IF;
END $$;

UPDATE "gateway_guardrails"
SET "action" = 'ENFORCE'
WHERE "type" = 'BEDROCK' AND "action" IN ('BLOCK', 'REDACT');

ALTER TABLE "gateway_guardrails" ADD COLUMN IF NOT EXISTS "redaction_label" TEXT;
