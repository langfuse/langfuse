-- CreateIndex
CREATE INDEX "dataset_items_source_observation_id_idx" ON "dataset_items" USING HASH ("source_observation_id");

-- CreateIndex
CREATE INDEX "dataset_items_dataset_id_idx" ON "dataset_items" USING HASH ("dataset_id");

-- CreateIndex
CREATE INDEX "dataset_run_items_dataset_run_id_idx" ON "dataset_run_items" USING HASH ("dataset_run_id");

-- CreateIndex
CREATE INDEX "dataset_run_items_dataset_item_id_idx" ON "dataset_run_items" USING HASH ("dataset_item_id");

-- CreateIndex
CREATE INDEX "dataset_run_items_observation_id_idx" ON "dataset_run_items" USING HASH ("observation_id");

-- CreateIndex
CREATE INDEX "dataset_runs_dataset_id_idx" ON "dataset_runs" USING HASH ("dataset_id");

-- CreateIndex
CREATE INDEX "datasets_project_id_idx" ON "datasets" USING HASH ("project_id");
