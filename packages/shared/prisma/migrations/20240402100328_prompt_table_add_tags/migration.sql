-- AlterTable
ALTER TABLE "prompts" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "prompts_tags_idx" ON "prompts" USING GIN ("tags" array_ops);
