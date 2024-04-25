-- AlterTable
ALTER TABLE "dataset_items" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "datasets" ADD COLUMN     "metadata" JSONB;
