BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "frontmatter" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commit_message" TEXT,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_blobs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_at" TIMESTAMP(3),
    "project_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "sha_256_hash" CHAR(44) NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_length" BIGINT NOT NULL,
    "bucket_path" TEXT NOT NULL,
    "bucket_name" TEXT NOT NULL,

    CONSTRAINT "skill_blobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_files" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "blob_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "executable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "skill_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "skill_protected_labels" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "skill_protected_labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "skills_project_id_name_version_key" ON "skills"("project_id", "name", "version");
CREATE UNIQUE INDEX "skills_project_id_id_key" ON "skills"("project_id", "id");
CREATE INDEX "skills_project_id_id_idx" ON "skills"("project_id", "id");
CREATE INDEX "skills_created_at_idx" ON "skills"("created_at");
CREATE INDEX "skills_updated_at_idx" ON "skills"("updated_at");
CREATE INDEX "skills_tags_idx" ON "skills" USING GIN ("tags");
CREATE INDEX "skills_labels_idx" ON "skills" USING GIN ("labels");

CREATE UNIQUE INDEX "skill_blobs_project_id_id_key" ON "skill_blobs"("project_id", "id");
CREATE UNIQUE INDEX "skill_blobs_project_id_sha_256_hash_key" ON "skill_blobs"("project_id", "sha_256_hash");
CREATE INDEX "skill_blobs_project_id_created_at_idx" ON "skill_blobs"("project_id", "created_at");

CREATE UNIQUE INDEX "skill_files_project_id_skill_id_path_key" ON "skill_files"("project_id", "skill_id", "path");
CREATE INDEX "skill_files_project_id_blob_id_idx" ON "skill_files"("project_id", "blob_id");

CREATE UNIQUE INDEX "skill_protected_labels_project_id_label_key" ON "skill_protected_labels"("project_id", "label");

ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_blobs" ADD CONSTRAINT "skill_blobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_project_id_skill_id_fkey" FOREIGN KEY ("project_id", "skill_id") REFERENCES "skills"("project_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_project_id_blob_id_fkey" FOREIGN KEY ("project_id", "blob_id") REFERENCES "skill_blobs"("project_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "skill_protected_labels" ADD CONSTRAINT "skill_protected_labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
