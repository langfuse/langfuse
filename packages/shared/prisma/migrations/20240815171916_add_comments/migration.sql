-- CreateEnum
CREATE TYPE "CommentObjectType" AS ENUM ('TRACE', 'OBSERVATION', 'SESSION', 'PROMPT');

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "object_type" "CommentObjectType" NOT NULL,
    "object_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "author_user_id" TEXT,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_project_id_object_type_object_id_idx" ON "comments"("project_id", "object_type", "object_id");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
