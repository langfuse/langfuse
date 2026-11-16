-- CockroachDB has no HASH index access method; these are B-tree indexes.

-- CreateIndex
CREATE INDEX "dataset_items_source_observation_id_idx" ON "dataset_items"("source_observation_id");

-- CreateIndex
CREATE INDEX "dataset_items_dataset_id_idx" ON "dataset_items"("dataset_id");

-- CreateIndex
CREATE INDEX "dataset_run_items_dataset_run_id_idx" ON "dataset_run_items"("dataset_run_id");

-- CreateIndex
CREATE INDEX "dataset_run_items_dataset_item_id_idx" ON "dataset_run_items"("dataset_item_id");

-- CreateIndex
CREATE INDEX "dataset_run_items_observation_id_idx" ON "dataset_run_items"("observation_id");

-- CreateIndex
CREATE INDEX "dataset_runs_dataset_id_idx" ON "dataset_runs"("dataset_id");

-- CreateIndex
CREATE INDEX "datasets_project_id_idx" ON "datasets"("project_id");
