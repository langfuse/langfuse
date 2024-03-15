-- DropForeignKey
ALTER TABLE "dataset_run_items" DROP CONSTRAINT "dataset_run_items_dataset_item_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_run_items" DROP CONSTRAINT "dataset_run_items_dataset_run_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_run_items" DROP CONSTRAINT "dataset_run_items_observation_id_fkey";

-- DropForeignKey
ALTER TABLE "dataset_runs" DROP CONSTRAINT "dataset_runs_dataset_id_fkey";

-- DropForeignKey
ALTER TABLE "observations" DROP CONSTRAINT "observations_project_id_fkey";

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_runs" ADD CONSTRAINT "dataset_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_dataset_run_id_fkey" FOREIGN KEY ("dataset_run_id") REFERENCES "dataset_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_dataset_item_id_fkey" FOREIGN KEY ("dataset_item_id") REFERENCES "dataset_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
