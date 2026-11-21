-- CreateEnum
CREATE TYPE "SessionViewOwnership" AS ENUM ('PRIVATE', 'PROJECT');

-- AlterTable
ALTER TABLE "annotation_queues" ADD COLUMN "session_view_id" TEXT;

-- AlterTable
ALTER TABLE "session_views" ADD COLUMN "ownership" "SessionViewOwnership" NOT NULL DEFAULT 'PROJECT';

-- DropIndex
DROP INDEX "session_views_project_id_name_key";

-- CreateIndex
CREATE INDEX "annotation_queues_project_id_session_view_id_idx" ON "annotation_queues"("project_id", "session_view_id");

-- AddForeignKey
ALTER TABLE "annotation_queues" ADD CONSTRAINT "annotation_queues_project_id_session_view_id_fkey" FOREIGN KEY ("project_id", "session_view_id") REFERENCES "session_views"("project_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
