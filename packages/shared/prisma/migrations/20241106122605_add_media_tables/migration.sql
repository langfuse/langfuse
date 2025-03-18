-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "sha_256_hash" CHAR(44) NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_at" TIMESTAMP(3),
    "upload_http_status" INTEGER,
    "upload_http_error" TEXT,
    "bucket_path" TEXT NOT NULL,
    "bucket_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_length" BIGINT NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_media" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,

    CONSTRAINT "trace_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation_media" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,

    CONSTRAINT "observation_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_project_id_sha_256_hash_key" ON "media"("project_id", "sha_256_hash");

-- CreateIndex
CREATE UNIQUE INDEX "trace_media_project_id_trace_id_media_id_field_key" ON "trace_media"("project_id", "trace_id", "media_id", "field");

-- CreateIndex
CREATE INDEX "observation_media_project_id_observation_id_idx" ON "observation_media"("project_id", "observation_id");

-- CreateIndex
CREATE UNIQUE INDEX "observation_media_project_id_trace_id_observation_id_media__key" ON "observation_media"("project_id", "trace_id", "observation_id", "media_id", "field");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_media" ADD CONSTRAINT "trace_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_media" ADD CONSTRAINT "trace_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_media" ADD CONSTRAINT "observation_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_media" ADD CONSTRAINT "observation_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
