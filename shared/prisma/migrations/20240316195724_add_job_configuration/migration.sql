-- CreateTable
CREATE TABLE "job_configurations" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "eval_template_id" TEXT,
    "score_name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "target_object" TEXT NOT NULL,
    "variable_mapping" JSONB NOT NULL,
    "sampling" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "job_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_configurations_project_id_id_idx" ON "job_configurations"("project_id", "id");

-- CreateIndex
CREATE INDEX "job_configurations_project_id_idx" ON "job_configurations"("project_id");

-- AddForeignKey
ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_eval_template_id_fkey" FOREIGN KEY ("eval_template_id") REFERENCES "eval_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
