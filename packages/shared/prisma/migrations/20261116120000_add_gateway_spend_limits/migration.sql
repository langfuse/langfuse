DO $$ BEGIN
  CREATE TYPE "GatewaySpendLimitScope" AS ENUM ('API_KEY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "GatewaySpendLimitInterval" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'TOTAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "gateway_spend_limits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope" "GatewaySpendLimitScope" NOT NULL,
    "api_key_id" TEXT,
    "interval" "GatewaySpendLimitInterval" NOT NULL,
    "limit_usd" DECIMAL(65,30) NOT NULL,
    "counting_started_at" TIMESTAMP(3) NOT NULL,
    "owner_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_spend_limits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_spend_limits_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limits_api_key_id_fkey"
        FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limits_owner_user_id_fkey"
        FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limits_scope_check"
        CHECK (("scope" = 'API_KEY') = ("api_key_id" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limits_api_key_id_interval_key" ON "gateway_spend_limits"("api_key_id", "interval");

CREATE INDEX IF NOT EXISTS "gateway_spend_limits_organization_id_idx" ON "gateway_spend_limits"("organization_id");

DO $$ BEGIN
  CREATE TYPE "GatewaySpendLimitAlertType" AS ENUM ('EXCEEDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "gateway_spend_limit_alerts" (
    "id" TEXT NOT NULL,
    "spend_limit_id" TEXT NOT NULL,
    "type" "GatewaySpendLimitAlertType" NOT NULL,
    "counting_started_at" TIMESTAMP(3) NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_spend_limit_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_spend_limit_alerts_spend_limit_id_fkey"
        FOREIGN KEY ("spend_limit_id") REFERENCES "gateway_spend_limits"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limit_alerts_limit_type_counting_window_key" ON "gateway_spend_limit_alerts"("spend_limit_id", "type", "counting_started_at", "window_start");
