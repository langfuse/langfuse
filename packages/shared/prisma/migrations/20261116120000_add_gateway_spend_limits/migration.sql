DO $$ BEGIN
  CREATE TYPE "GatewaySpendLimitInterval" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'LIFETIME');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "gateway_spend_limits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "interval" "GatewaySpendLimitInterval" NOT NULL,
    "limit_usd" DECIMAL(65,30) NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMP(3),
    "baseline_spend_usd" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "baseline_window_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_spend_limits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_spend_limits_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "gateway_spend_limits_api_key_id_fkey"
        FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limits_api_key_id_interval_key" ON "gateway_spend_limits"("api_key_id", "interval");

CREATE INDEX IF NOT EXISTS "gateway_spend_limits_organization_id_idx" ON "gateway_spend_limits"("organization_id");
