ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'USER';

ALTER TABLE "gateway_spend_limits" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "gateway_spend_limits"
    ADD CONSTRAINT "gateway_spend_limits_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "gateway_spend_limits" DROP CONSTRAINT IF EXISTS "gateway_spend_limits_scope_check";
ALTER TABLE "gateway_spend_limits"
  ADD CONSTRAINT "gateway_spend_limits_scope_check"
  -- Compares as text: Postgres cannot use a new enum value in the transaction that adds it.
  CHECK (
    ("scope"::text = 'API_KEY') = ("api_key_id" IS NOT NULL)
    AND ("scope"::text = 'USER') = ("user_id" IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limits_organization_id_user_id_interval_key" ON "gateway_spend_limits"("organization_id", "user_id", "interval");

CREATE INDEX IF NOT EXISTS "gateway_spend_limits_user_id_idx" ON "gateway_spend_limits"("user_id");
