-- AlterTable
-- dataset_item_media is unreleased and therefore empty outside of dev databases
ALTER TABLE "dataset_item_media" ADD COLUMN "reference_string" TEXT NOT NULL;
