-- DropIndex
DROP INDEX "traces_project_id_name_idx";

-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "user_id" TEXT;

-- CreateIndex
CREATE INDEX "traces_project_id_name_user_id_idx" ON "traces"("project_id", "name", "user_id");
