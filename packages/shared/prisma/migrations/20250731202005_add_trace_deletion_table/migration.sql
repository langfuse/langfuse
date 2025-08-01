-- CreateTable
CREATE TABLE "pending_deletions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_deletions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_deletions_project_id_object_is_deleted_idx" ON "pending_deletions"("project_id", "object", "is_deleted");

-- CreateIndex
CREATE INDEX "pending_deletions_object_id_object_idx" ON "pending_deletions"("object_id", "object");

-- AddForeignKey
ALTER TABLE "pending_deletions" ADD CONSTRAINT "pending_deletions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
