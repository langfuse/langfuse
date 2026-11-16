CREATE TABLE IF NOT EXISTS "gateway_spend_limit_alerts" (
    "id" TEXT NOT NULL,
    "spend_limit_id" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_spend_limit_alerts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gateway_spend_limit_alerts_spend_limit_id_fkey"
        FOREIGN KEY ("spend_limit_id") REFERENCES "gateway_spend_limits"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_spend_limit_alerts_limit_generation_window_key" ON "gateway_spend_limit_alerts"("spend_limit_id", "generation", "window_start");
