-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('WEBHOOK', 'ANNOTATION_QUEUE');

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActionType" NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggers" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "description" TEXT,
    "eventSource" TEXT NOT NULL,
    "filter" JSONB,
    "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE',
    "sampling" DECIMAL(65,30) NOT NULL,
    "delay" INTEGER NOT NULL,

    CONSTRAINT "triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggers_on_actions" (
    "trigger_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "triggers_on_actions_pkey" PRIMARY KEY ("trigger_id","action_id")
);

-- CreateTable
CREATE TABLE "action_executions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_id" TEXT NOT NULL,
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
CREATE UNIQUE INDEX "actions_project_id_name_key" ON "actions"("project_id", "name");

-- CreateIndex
CREATE INDEX "triggers_project_id_eventSource_idx" ON "triggers"("project_id", "eventSource");

-- CreateIndex
CREATE INDEX "triggers_on_actions_trigger_id_idx" ON "triggers_on_actions"("trigger_id");

-- CreateIndex
CREATE INDEX "triggers_on_actions_action_id_idx" ON "triggers_on_actions"("action_id");

-- CreateIndex
CREATE INDEX "action_executions_trigger_id_idx" ON "action_executions"("trigger_id");

-- CreateIndex
CREATE INDEX "action_executions_action_id_idx" ON "action_executions"("action_id");

-- CreateIndex
CREATE INDEX "action_executions_project_id_idx" ON "action_executions"("project_id");

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggers_on_actions" ADD CONSTRAINT "triggers_on_actions_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggers_on_actions" ADD CONSTRAINT "triggers_on_actions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triggers_on_actions" ADD CONSTRAINT "triggers_on_actions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_trigger_id_fkey" FOREIGN KEY ("trigger_id") REFERENCES "triggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_executions" ADD CONSTRAINT "action_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
