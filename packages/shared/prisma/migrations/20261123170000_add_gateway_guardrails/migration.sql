DO $$ BEGIN
  CREATE TYPE "GatewayGuardrailType" AS ENUM ('REGEX');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GatewayGuardrailAction" AS ENUM ('BLOCK', 'LOG', 'REDACT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GatewayGuardrailAssignmentScope" AS ENUM ('ORGANIZATION', 'API_KEY', 'USER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "gateway_guardrails" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GatewayGuardrailType" NOT NULL DEFAULT 'REGEX',
    "action" "GatewayGuardrailAction" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_guardrails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_guardrails_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_guardrails_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_guardrails_organization_id_name_key" ON "gateway_guardrails"("organization_id", "name");

CREATE TABLE IF NOT EXISTS "gateway_guardrail_assignments" (
    "id" TEXT NOT NULL,
    "guardrail_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope" "GatewayGuardrailAssignmentScope" NOT NULL,
    "api_key_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_guardrail_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_guardrail_assignments_guardrail_id_fkey"
        FOREIGN KEY ("guardrail_id") REFERENCES "gateway_guardrails"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_guardrail_assignments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_guardrail_assignments_api_key_id_fkey"
        FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_guardrail_assignments_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_guardrail_assignments_scope_check"
        CHECK (
            ("scope" = 'API_KEY') = ("api_key_id" IS NOT NULL)
            AND ("scope" = 'USER') = ("user_id" IS NOT NULL)
        )
);

CREATE INDEX IF NOT EXISTS "gateway_guardrail_assignments_organization_id_scope_idx" ON "gateway_guardrail_assignments"("organization_id", "scope");

CREATE INDEX IF NOT EXISTS "gateway_guardrail_assignments_api_key_id_idx" ON "gateway_guardrail_assignments"("api_key_id");

CREATE INDEX IF NOT EXISTS "gateway_guardrail_assignments_user_id_organization_id_idx" ON "gateway_guardrail_assignments"("user_id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_guardrail_assignments_organization_key" ON "gateway_guardrail_assignments"("guardrail_id") WHERE "scope" = 'ORGANIZATION';

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_guardrail_assignments_api_key_key" ON "gateway_guardrail_assignments"("guardrail_id", "api_key_id") WHERE "api_key_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_guardrail_assignments_user_key" ON "gateway_guardrail_assignments"("guardrail_id", "user_id") WHERE "user_id" IS NOT NULL;
