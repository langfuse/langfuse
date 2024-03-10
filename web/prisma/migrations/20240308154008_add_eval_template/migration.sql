-- CreateTable
CREATE TABLE "eval_templates" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_params" JSONB NOT NULL,
    "vars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "output_schema" JSONB NOT NULL,

    CONSTRAINT "eval_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eval_templates_project_id_id_idx" ON "eval_templates"("project_id", "id");

-- CreateIndex
CREATE INDEX "eval_templates_project_id_idx" ON "eval_templates"("project_id");

-- AddForeignKey
ALTER TABLE "eval_templates" ADD CONSTRAINT "eval_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
