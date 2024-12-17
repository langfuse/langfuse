-- AlterTable
ALTER TABLE "dataset_run_items" ADD COLUMN     "log" TEXT,
ALTER COLUMN "trace_id" DROP NOT NULL;
