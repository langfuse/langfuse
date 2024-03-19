-- AlterTable
ALTER TABLE "dataset_run_items" ADD COLUMN     "run_id" TEXT,
ALTER COLUMN "observation_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "dataset_run_items_run_id_idx" ON "dataset_run_items" USING HASH ("run_id");

-- AddForeignKey
ALTER TABLE "dataset_run_items" ADD CONSTRAINT "dataset_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
