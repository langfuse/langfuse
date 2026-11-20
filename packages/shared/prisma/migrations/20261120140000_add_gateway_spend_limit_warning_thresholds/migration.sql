ALTER TYPE "GatewaySpendLimitAlertType" ADD VALUE IF NOT EXISTS 'WARNING';

ALTER TABLE "gateway_spend_limits"
  ADD COLUMN IF NOT EXISTS "alert_thresholds" INTEGER[] NOT NULL DEFAULT ARRAY[100]::INTEGER[];

ALTER TABLE "gateway_spend_limit_alerts"
  ADD COLUMN IF NOT EXISTS "threshold_percent" INTEGER NOT NULL DEFAULT 100;

DROP INDEX IF EXISTS "gateway_spend_limit_alerts_limit_type_counting_window_key";
CREATE UNIQUE INDEX "gateway_spend_limit_alerts_limit_type_counting_window_key"
  ON "gateway_spend_limit_alerts"("spend_limit_id", "subject_id", "type", "threshold_percent", "counting_started_at", "window_start");
