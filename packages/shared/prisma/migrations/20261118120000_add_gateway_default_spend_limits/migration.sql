ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'API_KEY_DEFAULT';
ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'USER_DEFAULT';

-- One default per organization and scope. The scope check sets a subject column for every
-- other scope, so rows without one are exactly the defaults; the new enum values can't be
-- used in the transaction that adds them, and an enum cast is not allowed in an index predicate.
CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limits_organization_id_default_scope_key"
  ON "gateway_spend_limits"("organization_id", "scope")
  WHERE "api_key_id" IS NULL AND "user_id" IS NULL;

ALTER TABLE "gateway_spend_limit_alerts" ADD COLUMN IF NOT EXISTS "subject_id" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "gateway_spend_limit_alerts_limit_type_counting_window_key";
CREATE UNIQUE INDEX "gateway_spend_limit_alerts_limit_type_counting_window_key" ON "gateway_spend_limit_alerts"("spend_limit_id", "subject_id", "type", "counting_started_at", "window_start");
