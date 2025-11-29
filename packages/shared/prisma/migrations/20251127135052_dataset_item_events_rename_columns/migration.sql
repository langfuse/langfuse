-- DropIndex
DROP INDEX "public"."dataset_item_events_project_id_dataset_id_item_id_created_at_id";

-- AlterTable
ALTER TABLE "dataset_item_events" DROP COLUMN "created_at",
DROP COLUMN "deleted_at",
ADD COLUMN     "valid_from" TIMESTAMP(3),
ADD COLUMN     "valid_to" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "dataset_item_events_project_id_dataset_id_item_id_valid_to_idx" ON "dataset_item_events"("project_id", "dataset_id", "item_id", "valid_to");
