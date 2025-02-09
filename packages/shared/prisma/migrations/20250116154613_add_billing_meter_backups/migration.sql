-- CreateTable
CREATE TABLE "billing_meter_backups" (
    "stripe_customer_id" TEXT NOT NULL,
    "meter_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    
    "aggregated_value" INTEGER NOT NULL,
    
    "event_name" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "billing_meter_backups_stripe_customer_id_meter_id_start_tim_idx" ON "billing_meter_backups"("stripe_customer_id", "meter_id", "start_time", "end_time");

-- CreateIndex
CREATE UNIQUE INDEX "billing_meter_backups_stripe_customer_id_meter_id_start_tim_key" ON "billing_meter_backups"("stripe_customer_id", "meter_id", "start_time", "end_time");
