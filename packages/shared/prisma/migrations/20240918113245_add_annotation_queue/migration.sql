-- CreateEnum
CREATE TYPE "AnnotationQueueStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AnnotationQueueObjectType" AS ENUM ('TRACE', 'OBSERVATION');

-- CreateTable
CREATE TABLE "annotation_queues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "score_configs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_queue_items" (
    "id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "object_type" "AnnotationQueueObjectType" NOT NULL,
    "status" "AnnotationQueueStatus" NOT NULL DEFAULT 'PENDING',
    "edit_start_time" TIMESTAMP(3),
    "edit_start_by_user_id" TEXT,
    "annotator_user_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annotation_queues_id_project_id_idx" ON "annotation_queues"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "annotation_queues_project_id_name_key" ON "annotation_queues"("project_id", "name");

-- CreateIndex
CREATE INDEX "annotation_queue_items_queue_id_status_idx" ON "annotation_queue_items"("queue_id", "status");

-- CreateIndex
CREATE INDEX "annotation_queue_items_id_project_id_idx" ON "annotation_queue_items"("id", "project_id");

-- AddForeignKey
ALTER TABLE "annotation_queues" ADD CONSTRAINT "annotation_queues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "annotation_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_edit_start_by_user_id_fkey" FOREIGN KEY ("edit_start_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_annotator_user_id_fkey" FOREIGN KEY ("annotator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_items" ADD CONSTRAINT "annotation_queue_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;