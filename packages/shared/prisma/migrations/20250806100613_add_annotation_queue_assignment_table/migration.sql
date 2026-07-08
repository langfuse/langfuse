-- CreateTable
CREATE TABLE "annotation_queue_assignments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "queue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_queue_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "annotation_queue_assignments_project_id_queue_id_key" ON "annotation_queue_assignments"("project_id", "queue_id", "user_id");

-- AddForeignKey
ALTER TABLE "annotation_queue_assignments" ADD CONSTRAINT "annotation_queue_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_assignments" ADD CONSTRAINT "annotation_queue_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_assignments" ADD CONSTRAINT "annotation_queue_assignments_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "annotation_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
