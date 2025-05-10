-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('WEBHOOK', 'ANNOTATION_QUEUE');

-- CreateTable
CREATE TABLE "action_configurations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActionType" NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "action_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trigger_configurations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "description" TEXT,
    "eventSource" TEXT NOT NULL,
    "eventVersion" TEXT,
    "filter" JSONB,
    "action_id" TEXT NOT NULL,
    "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE',
    "last_fired_at" TIMESTAMP(3),
    "sampling" DECIMAL(65,30) NOT NULL,
    "delay" INTEGER NOT NULL,

    CONSTRAINT "trigger_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_executions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_ids" JSONB NOT NULL,
    "trigger_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "JobExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "action_configurations_project_id_name_key" ON "action_configurations"("project_id", "name");

-- CreateIndex
CREATE INDEX "trigger_configurations_project_id_eventSource_idx" ON "trigger_configurations"("project_id", "eventSource");

-- AddForeignKey
ALTER TABLE "action_configurations" ADD CONSTRAINT "action_configurations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trigger_configurations" ADD CONSTRAINT "trigger_configurations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trigger_configurations" ADD CONSTRAINT "trigger_configurations_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "action_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "trigger_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "action_configurations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
