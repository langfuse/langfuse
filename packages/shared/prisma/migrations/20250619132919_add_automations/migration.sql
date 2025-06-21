-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('WEBHOOK');

-- CreateEnum
CREATE TYPE "ActionExecutionStatus" AS ENUM ('COMPLETED', 'ERROR', 'PENDING', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "default_llm_models" DROP CONSTRAINT "default_llm_models_project_id_fkey";

-- DropForeignKey
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_template_id_fkey";

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
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
    "eventSource" TEXT NOT NULL,
    "eventActions" TEXT[],
    "filter" JSONB,
    "status" "JobConfigState" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triggers_on_actions" (
    "name" TEXT NOT NULL,
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
    "status" "ActionExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "action_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_project_id_idx" ON "actions"("project_id");

-- CreateIndex
CREATE INDEX "triggers_project_id_idx" ON "triggers"("project_id");

-- CreateIndex
CREATE INDEX "triggers_on_actions_project_id_action_id_trigger_id_idx" ON "triggers_on_actions"("project_id", "action_id", "trigger_id");

-- CreateIndex
CREATE INDEX "triggers_on_actions_project_id_name_idx" ON "triggers_on_actions"("project_id", "name");

-- CreateIndex
CREATE INDEX "action_executions_trigger_id_idx" ON "action_executions"("trigger_id");

-- CreateIndex
CREATE INDEX "action_executions_action_id_idx" ON "action_executions"("action_id");

-- CreateIndex
CREATE INDEX "action_executions_project_id_idx" ON "action_executions"("project_id");

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_job_template_id_fkey" FOREIGN KEY ("job_template_id") REFERENCES "eval_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "default_llm_models" ADD CONSTRAINT "default_llm_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
