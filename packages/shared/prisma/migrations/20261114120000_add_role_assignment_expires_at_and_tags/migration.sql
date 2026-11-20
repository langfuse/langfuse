-- AlterTable
ALTER TABLE "role_assignments" ADD COLUMN "expires_at" TIMESTAMP(3),
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "role_assignments_tags_idx" ON "role_assignments" USING GIN ("tags" array_ops);
