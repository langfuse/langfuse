-- AlterTable
ALTER TABLE "dataset_items" ADD COLUMN     "source_trace_id" TEXT;

-- AddForeignKey
ALTER TABLE "dataset_items" ADD CONSTRAINT "dataset_items_source_trace_id_fkey" FOREIGN KEY ("source_trace_id") REFERENCES "traces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
