-- CreateTable
CREATE TABLE "annotation_queue_memberships" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "annotation_queue_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_queue_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "annotation_queue_memberships_project_id_annotation_queue_id_key" ON "annotation_queue_memberships"("project_id", "annotation_queue_id", "user_id");

-- AddForeignKey
ALTER TABLE "annotation_queue_memberships" ADD CONSTRAINT "annotation_queue_memberships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_memberships" ADD CONSTRAINT "annotation_queue_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_queue_memberships" ADD CONSTRAINT "annotation_queue_memberships_annotation_queue_id_fkey" FOREIGN KEY ("annotation_queue_id") REFERENCES "annotation_queues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
