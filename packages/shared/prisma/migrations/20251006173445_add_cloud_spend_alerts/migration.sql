-- CreateTable
CREATE TABLE "cloud_spend_alerts" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "threshold" DECIMAL(65,30) NOT NULL,
    "triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cloud_spend_alerts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cloud_spend_alerts" ADD CONSTRAINT "cloud_spend_alerts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;