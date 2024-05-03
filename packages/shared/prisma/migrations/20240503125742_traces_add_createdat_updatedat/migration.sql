-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "traces_updated_at_idx" ON "traces"("updated_at");

-- CreateIndex
CREATE INDEX "traces_created_at_idx" ON "traces"("created_at");
