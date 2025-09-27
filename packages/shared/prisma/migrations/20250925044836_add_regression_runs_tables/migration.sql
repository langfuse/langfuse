-- CreateTable
CREATE TABLE "regression_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "experiment_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "evaluators" JSONB NOT NULL DEFAULT '[]',
    "total_runs" INTEGER NOT NULL DEFAULT 100,
    "promptVariants" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regression_runs_pkey" PRIMARY KEY ("id","project_id")
);

-- CreateTable
CREATE TABLE "regression_run_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "regression_run_id" TEXT NOT NULL,
    "prompt_variant" TEXT NOT NULL,
    "run_number" INTEGER NOT NULL,
    "dataset_item_id" TEXT NOT NULL,
    "trace_id" TEXT,
    "observation_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "evaluation_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regression_run_items_pkey" PRIMARY KEY ("id","project_id")
);

-- CreateIndex
CREATE INDEX "regression_runs_project_id_idx" ON "regression_runs"("project_id");

-- CreateIndex
CREATE INDEX "regression_runs_experiment_id_idx" ON "regression_runs"("experiment_id");

-- CreateIndex
CREATE INDEX "regression_runs_dataset_id_idx" ON "regression_runs"("dataset_id");

-- CreateIndex
CREATE INDEX "regression_runs_status_idx" ON "regression_runs"("status");

-- CreateIndex
CREATE INDEX "regression_runs_created_at_idx" ON "regression_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "regression_runs_project_id_experiment_id_name_key" ON "regression_runs"("project_id", "experiment_id", "name");

-- CreateIndex
CREATE INDEX "regression_run_items_project_id_idx" ON "regression_run_items"("project_id");

-- CreateIndex
CREATE INDEX "regression_run_items_regression_run_id_idx" ON "regression_run_items"("regression_run_id");

-- CreateIndex
CREATE INDEX "regression_run_items_prompt_variant_idx" ON "regression_run_items"("prompt_variant");

-- CreateIndex
CREATE INDEX "regression_run_items_status_idx" ON "regression_run_items"("status");

-- CreateIndex
CREATE INDEX "regression_run_items_created_at_idx" ON "regression_run_items"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "regression_run_items_regression_run_id_prompt_variant_run_n_key" ON "regression_run_items"("regression_run_id", "prompt_variant", "run_number", "dataset_item_id", "project_id");

-- AddForeignKey
ALTER TABLE "regression_runs" ADD CONSTRAINT "regression_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regression_runs" ADD CONSTRAINT "regression_runs_dataset_id_project_id_fkey" FOREIGN KEY ("dataset_id", "project_id") REFERENCES "datasets"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regression_run_items" ADD CONSTRAINT "regression_run_items_regression_run_id_project_id_fkey" FOREIGN KEY ("regression_run_id", "project_id") REFERENCES "regression_runs"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regression_run_items" ADD CONSTRAINT "regression_run_items_dataset_item_id_project_id_fkey" FOREIGN KEY ("dataset_item_id", "project_id") REFERENCES "dataset_items"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
