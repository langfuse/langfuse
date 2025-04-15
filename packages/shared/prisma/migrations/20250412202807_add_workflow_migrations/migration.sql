-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowEventType" AS ENUM ('CREATED', 'STARTED', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT', 'RETRY', 'STATUS_CHANGE', 'ERROR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WorkflowObjectType" AS ENUM ('WORKFLOW', 'WORKFLOW_EXECUTION', 'ACTIVITY');

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "timeout_duration" INTEGER,
    "source_event_type" TEXT NOT NULL,
    "source_event_filter" JSONB,
    "delay" INTEGER,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "parameters" JSONB,
    "project_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_types" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input_schema" JSONB,
    "output_schema" JSONB,
    "version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "task_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "predecessor_task_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "mappings" JSONB,
    "timeout_duration" INTEGER,
    "version" TEXT,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "predecessor_activity_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workflow_execution_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_type_id" TEXT NOT NULL,
    "parameters" JSONB,
    "name" TEXT NOT NULL,
    "output" JSONB,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "eventType" "WorkflowEventType" NOT NULL,
    "objectType" "WorkflowObjectType" NOT NULL,
    "object_id" TEXT NOT NULL,
    "workflow_execution_id" TEXT,
    "activity_id" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflows_project_id_idx" ON "workflows"("project_id");

-- CreateIndex
CREATE INDEX "workflow_executions_project_id_idx" ON "workflow_executions"("project_id");

-- CreateIndex
CREATE INDEX "workflow_executions_workflow_id_idx" ON "workflow_executions"("workflow_id");

-- CreateIndex
CREATE INDEX "task_types_project_id_idx" ON "task_types"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_types_project_id_name_key" ON "task_types"("project_id", "name");

-- CreateIndex
CREATE INDEX "tasks_project_id_idx" ON "tasks"("project_id");

-- CreateIndex
CREATE INDEX "tasks_workflow_id_idx" ON "tasks"("workflow_id");

-- CreateIndex
CREATE INDEX "tasks_task_type_id_idx" ON "tasks"("task_type_id");

-- CreateIndex
CREATE INDEX "activities_project_id_idx" ON "activities"("project_id");

-- CreateIndex
CREATE INDEX "activities_workflow_execution_id_idx" ON "activities"("workflow_execution_id");

-- CreateIndex
CREATE INDEX "activities_task_id_idx" ON "activities"("task_id");

-- CreateIndex
CREATE INDEX "workflow_events_project_id_idx" ON "workflow_events"("project_id");

-- CreateIndex
CREATE INDEX "workflow_events_workflow_execution_id_idx" ON "workflow_events"("workflow_execution_id");

-- CreateIndex
CREATE INDEX "workflow_events_activity_id_idx" ON "workflow_events"("activity_id");

-- CreateIndex
CREATE INDEX "workflow_events_objectType_object_id_idx" ON "workflow_events"("objectType", "object_id");

-- CreateIndex
CREATE INDEX "workflow_events_eventType_idx" ON "workflow_events"("eventType");

-- CreateIndex
CREATE INDEX "workflow_events_timestamp_idx" ON "workflow_events"("timestamp");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_type_id_fkey" FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_workflow_execution_id_fkey" FOREIGN KEY ("workflow_execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_workflow_execution_id_fkey" FOREIGN KEY ("workflow_execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_events" ADD CONSTRAINT "workflow_events_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
