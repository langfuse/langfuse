-- CreateEnum
CREATE TYPE "MonitorThresholdOperator" AS ENUM ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ');

-- CreateEnum
CREATE TYPE "MonitorSeverity" AS ENUM ('UNKNOWN', 'OK', 'WARNING', 'ALERT', 'NO_DATA');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ERROR_BAD_QUERY');

-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "updated_by" TEXT,
    "project_id" TEXT NOT NULL,
    "view" "DashboardWidgetViews" NOT NULL,
    "filters" JSONB NOT NULL,
    "metric" JSONB NOT NULL,
    "window_ms" BIGINT NOT NULL,
    "cadence_ms" BIGINT NOT NULL,
    "threshold_operator" "MonitorThresholdOperator" NOT NULL,
    "alert_threshold" DECIMAL(65,30) NOT NULL,
    "warning_threshold" DECIMAL(65,30),
    "severity" "MonitorSeverity" NOT NULL DEFAULT 'UNKNOWN',
    "severity_changed_at" TIMESTAMP(3),
    "no_data" JSONB NOT NULL,
    "renotify" JSONB NOT NULL,
    "status" "MonitorStatus" NOT NULL DEFAULT 'ACTIVE',
    "scheduler_batch_id" BIGINT NOT NULL,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_published_run_at" TIMESTAMP(3),
    "last_completed_run_at" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alerted_at" TIMESTAMP(3),

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitors_project_id_idx" ON "monitors"("project_id");

-- CreateIndex
CREATE INDEX "monitors_scheduler_batch_id_idx" ON "monitors"("scheduler_batch_id");

-- CreateIndex
CREATE INDEX "monitors_scheduler_tick_idx" ON "monitors"("next_run_at", "scheduler_batch_id");

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
