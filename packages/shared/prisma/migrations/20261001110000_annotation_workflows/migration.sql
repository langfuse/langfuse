CREATE TABLE "annotation_workflows" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "annotation_workflow_versions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "prompt" TEXT,
    "model_provider" TEXT,
    "model_name" TEXT,
    "published_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_workflow_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "annotation_responses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "workflow_version_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "annotation_workflows_queue_id_key" ON "annotation_workflows"("queue_id");
CREATE UNIQUE INDEX "annotation_workflows_id_project_id_key" ON "annotation_workflows"("id", "project_id");
CREATE INDEX "annotation_workflows_project_id_updated_at_idx" ON "annotation_workflows"("project_id", "updated_at" DESC);
CREATE UNIQUE INDEX "annotation_workflow_versions_workflow_id_version_key" ON "annotation_workflow_versions"("workflow_id", "version");
CREATE INDEX "annotation_workflow_versions_workflow_id_created_at_idx" ON "annotation_workflow_versions"("workflow_id", "created_at" DESC);
CREATE UNIQUE INDEX "annotation_responses_item_id_user_id_key" ON "annotation_responses"("item_id", "user_id");
CREATE INDEX "annotation_responses_project_id_submitted_at_idx" ON "annotation_responses"("project_id", "submitted_at" DESC);
CREATE INDEX "annotation_responses_workflow_version_id_idx" ON "annotation_responses"("workflow_version_id");

ALTER TABLE "annotation_workflows" ADD CONSTRAINT "annotation_workflows_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotation_workflows" ADD CONSTRAINT "annotation_workflows_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "annotation_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotation_workflows" ADD CONSTRAINT "annotation_workflows_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annotation_workflow_versions" ADD CONSTRAINT "annotation_workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "annotation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotation_workflow_versions" ADD CONSTRAINT "annotation_workflow_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annotation_responses" ADD CONSTRAINT "annotation_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotation_responses" ADD CONSTRAINT "annotation_responses_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "annotation_queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotation_responses" ADD CONSTRAINT "annotation_responses_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "annotation_workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "annotation_responses" ADD CONSTRAINT "annotation_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
