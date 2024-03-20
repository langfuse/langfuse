-- CreateTable
CREATE TABLE "eval_templates" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_params" JSONB NOT NULL,
    "vars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "output_schema" JSONB NOT NULL,

    CONSTRAINT "eval_templates_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "eval_templates_project_id_id_idx" ON "eval_templates"("project_id", "id");

-- CreateIndex
CREATE INDEX "eval_templates_project_id_idx" ON "eval_templates"("project_id");

-- CreateIndex
CREATE INDEX "job_configurations_project_id_id_idx" ON "job_configurations"("project_id", "id");

-- CreateIndex
CREATE INDEX "job_configurations_project_id_idx" ON "job_configurations"("project_id");

-- AddForeignKey
ALTER TABLE "eval_templates" ADD CONSTRAINT "eval_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_configurations" ADD CONSTRAINT "job_configurations_eval_template_id_fkey" FOREIGN KEY ("eval_template_id") REFERENCES "eval_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
