-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "input" JSONB,
ADD COLUMN     "output" JSONB,
ADD COLUMN     "session_id" TEXT;

-- CreateIndex
CREATE INDEX "traces_session_id_idx" ON "traces"("session_id");
