-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "metadata" JSON NOT NULL DEFAULT '{}',
    "allowed_tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commit_message" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_protected_labels" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "skill_protected_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skills_project_id_id_idx" ON "skills"("project_id", "id");

-- CreateIndex
CREATE INDEX "skills_created_at_idx" ON "skills"("created_at");

-- CreateIndex
CREATE INDEX "skills_updated_at_idx" ON "skills"("updated_at");

-- CreateIndex
CREATE INDEX "skills_tags_idx" ON "skills" USING GIN ("tags" array_ops);

-- CreateIndex
CREATE UNIQUE INDEX "skills_project_id_name_version_key" ON "skills"("project_id", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "skill_protected_labels_project_id_label_key" ON "skill_protected_labels"("project_id", "label");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_protected_labels" ADD CONSTRAINT "skill_protected_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
