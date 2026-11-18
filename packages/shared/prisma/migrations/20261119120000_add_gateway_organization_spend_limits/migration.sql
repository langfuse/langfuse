ALTER TYPE "GatewaySpendLimitScope" ADD VALUE IF NOT EXISTS 'ORGANIZATION';

-- Organization limits have no subject either, so the defaults' index names their scopes.
DROP INDEX IF EXISTS "gateway_spend_limits_organization_id_default_scope_key";
CREATE UNIQUE INDEX "gateway_spend_limits_organization_id_default_scope_key"
  ON "gateway_spend_limits"("organization_id", "scope")
  WHERE "scope" IN ('API_KEY_DEFAULT', 'USER_DEFAULT');

-- One organization limit per interval. The new enum value can't be used in the
-- transaction that adds it, so the predicate names the subject-less rows that
-- aren't defaults, which the scope check makes exactly the organization limits.
CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limits_organization_id_interval_key"
  ON "gateway_spend_limits"("organization_id", "interval")
  WHERE "api_key_id" IS NULL
    AND "user_id" IS NULL
    AND "scope" NOT IN ('API_KEY_DEFAULT', 'USER_DEFAULT');
