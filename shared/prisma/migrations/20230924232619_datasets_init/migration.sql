-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_items" (
    "id" TEXT NOT NULL,
    "input" JSONB,
    "expected_output" JSONB,
    "source_observation_id" TEXT,
    "dataset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_run_items" (
    "id" TEXT NOT NULL,
    "dataset_run_id" TEXT NOT NULL,
    "dataset_item_id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_run_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_source_observation_id_fkey" FOREIGN KEY ("source_observation_id") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_runs" ADD CONSTRAINT "dataset_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_dataset_run_id_fkey" FOREIGN KEY ("dataset_run_id") REFERENCES "dataset_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_dataset_item_id_fkey" FOREIGN KEY ("dataset_item_id") REFERENCES "dataset_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
