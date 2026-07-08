-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "prompt_id" TEXT;

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompts_project_id_name_version_idx" ON "prompts"("project_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "prompts_project_id_name_version_key" ON "prompts"("project_id", "name", "version");

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
