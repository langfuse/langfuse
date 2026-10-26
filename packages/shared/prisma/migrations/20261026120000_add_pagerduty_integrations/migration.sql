-- CreateEnum
CREATE TYPE "PagerDutyRegion" AS ENUM ('US', 'EU');

-- CreateTable
CREATE TABLE "pagerduty_integrations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routing_key" TEXT NOT NULL,
    "display_routing_key" TEXT NOT NULL,
    "region" "PagerDutyRegion" NOT NULL DEFAULT 'US',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagerduty_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pagerduty_integrations_project_id_name_key" ON "pagerduty_integrations"("project_id", "name");

-- AddForeignKey
ALTER TABLE "pagerduty_integrations" ADD CONSTRAINT "pagerduty_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
