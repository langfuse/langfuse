-- AlterTable
ALTER TABLE "dataset_run_items" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "user_id" TEXT;

-- AlterTable
ALTER TABLE "scores" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "dataset_run_items_user_id_idx" ON "dataset_run_items"("user_id");

-- CreateIndex
CREATE INDEX "observations_user_id_idx" ON "observations"("user_id");

-- CreateIndex
CREATE INDEX "scores_user_id_idx" ON "scores"("user_id");
