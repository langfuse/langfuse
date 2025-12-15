-- AlterTable
ALTER TABLE "dataset_items" ADD COLUMN     "valid_to" TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "dataset_item_events_project_id_dataset_id_item_id_created_at_id" RENAME TO "dataset_item_events_project_id_dataset_id_item_id_created_a_idx";
