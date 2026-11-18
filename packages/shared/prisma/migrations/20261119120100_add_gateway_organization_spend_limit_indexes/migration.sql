-- Organization limits have no subject either, so the defaults' index names their scopes.
DROP INDEX IF EXISTS "gateway_spend_limits_organization_id_default_scope_key";
CREATE UNIQUE INDEX "gateway_spend_limits_organization_id_default_scope_key"
  ON "gateway_spend_limits"("organization_id", "scope")
  WHERE "scope" IN ('API_KEY_DEFAULT', 'USER_DEFAULT');

-- One organization limit per interval.
CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limits_organization_id_interval_key"
  ON "gateway_spend_limits"("organization_id", "interval")
  WHERE "scope" = 'ORGANIZATION';
