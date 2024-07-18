-- Add project_id to datasets, dataset_items, dataset_runs, dataset_run_items
ALTER TABLE "dataset_items" 
ADD COLUMN "project_id" TEXT;

ALTER TABLE "dataset_run_items" 
ADD COLUMN "project_id" TEXT;

ALTER TABLE "dataset_runs" 
ADD COLUMN "project_id" TEXT;

-- Backfill project_id for dataset_items
UPDATE dataset_items
SET project_id = datasets.project_id
FROM datasets
WHERE dataset_items.dataset_id = datasets.id;

-- Backfill project_id for dataset_runs
UPDATE dataset_runs
SET project_id = datasets.project_id
FROM datasets
WHERE dataset_runs.dataset_id = datasets.id;

-- Backfill project_id for dataset_run_items
UPDATE dataset_run_items
SET project_id = dataset_runs.project_id
FROM dataset_runs
WHERE dataset_run_items.dataset_run_id = dataset_runs.id;

-- Drop the old foreign keys
ALTER TABLE "dataset_run_items" 
DROP CONSTRAINT "dataset_run_items_dataset_item_id_fkey",
DROP CONSTRAINT "dataset_run_items_dataset_run_id_fkey";

ALTER TABLE "dataset_items" 
DROP CONSTRAINT "dataset_items_dataset_id_fkey";

ALTER TABLE "dataset_runs" 
DROP CONSTRAINT "dataset_runs_dataset_id_fkey";

-- Now alter the columns to NOT NULL and update primary keys
ALTER TABLE "datasets" 
DROP CONSTRAINT "datasets_pkey",
ADD CONSTRAINT "datasets_pkey" PRIMARY KEY ("id", "project_id");

ALTER TABLE "dataset_items" 
ALTER COLUMN "project_id" SET NOT NULL,
DROP CONSTRAINT "dataset_items_pkey",
ADD CONSTRAINT "dataset_items_pkey" PRIMARY KEY ("id", "project_id");

ALTER TABLE "dataset_runs" 
ALTER COLUMN "project_id" SET NOT NULL,
DROP CONSTRAINT "dataset_runs_pkey",
ADD CONSTRAINT "dataset_runs_pkey" PRIMARY KEY ("id", "project_id");

ALTER TABLE "dataset_run_items" 
ALTER COLUMN "project_id" SET NOT NULL,
DROP CONSTRAINT "dataset_run_items_pkey",
ADD CONSTRAINT "dataset_run_items_pkey" PRIMARY KEY ("id", "project_id");


-- Add new foreign keys
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_dataset_id_project_id_fkey" FOREIGN KEY ("dataset_id", "project_id") REFERENCES "datasets"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dataset_runs" ADD CONSTRAINT "dataset_runs_dataset_id_project_id_fkey" FOREIGN KEY ("dataset_id", "project_id") REFERENCES "datasets"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_dataset_run_id_project_id_fkey" FOREIGN KEY ("dataset_run_id", "project_id") REFERENCES "dataset_runs"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_dataset_item_id_project_id_fkey" FOREIGN KEY ("dataset_item_id", "project_id") REFERENCES "dataset_items"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
