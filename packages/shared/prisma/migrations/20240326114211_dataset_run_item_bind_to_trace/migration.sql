-- AlterTable
ALTER TABLE "dataset_run_items" ADD COLUMN     "trace_id" TEXT,
ALTER COLUMN "observation_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_trace_id_fkey" FOREIGN KEY ("trace_id") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
