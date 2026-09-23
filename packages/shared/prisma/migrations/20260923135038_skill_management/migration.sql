-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frontmatter" JSON NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commit_message" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_files" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "blob_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,

    CONSTRAINT "skill_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_blobs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "project_id" TEXT NOT NULL,
    "sha_256_hash" CHAR(44) NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_length" INTEGER NOT NULL,
    "bucket_path" TEXT NOT NULL,

    CONSTRAINT "skill_blobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "skills_created_at_idx" ON "skills"("created_at");

-- CreateIndex
CREATE INDEX "skills_updated_at_idx" ON "skills"("updated_at");

-- CreateIndex
CREATE INDEX "skills_tags_idx" ON "skills" USING GIN ("tags" array_ops);

-- CreateIndex
CREATE INDEX "skills_labels_idx" ON "skills" USING GIN ("labels" array_ops);

-- CreateIndex
CREATE UNIQUE INDEX "skills_project_id_name_version_key" ON "skills"("project_id", "name", "version");

-- CreateIndex
CREATE INDEX "skill_files_project_id_blob_id_idx" ON "skill_files"("project_id", "blob_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_files_project_id_skill_id_path_key" ON "skill_files"("project_id", "skill_id", "path");

-- CreateIndex
CREATE UNIQUE INDEX "skill_blobs_project_id_sha_256_hash_key" ON "skill_blobs"("project_id", "sha_256_hash");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_blob_id_fkey" FOREIGN KEY ("blob_id") REFERENCES "skill_blobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_blobs" ADD CONSTRAINT "skill_blobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
