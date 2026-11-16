-- On PostgreSQL "media" is left without a primary key and relies on the unique
-- index "media_project_id_id_key". Every CockroachDB table has a primary key, so
-- (project_id, id) becomes the primary key instead. Uniqueness is the same.

-- DropForeignKey
ALTER TABLE "observation_media" DROP CONSTRAINT "observation_media_media_id_fkey";

-- DropForeignKey
ALTER TABLE "trace_media" DROP CONSTRAINT "trace_media_media_id_fkey";

-- AlterTable
ALTER TABLE "media" DROP CONSTRAINT "media_pkey", ADD CONSTRAINT "media_pkey" PRIMARY KEY ("project_id", "id");

-- AddForeignKey
ALTER TABLE "trace_media" ADD CONSTRAINT "trace_media_media_id_project_id_fkey" FOREIGN KEY ("media_id", "project_id") REFERENCES "media"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_media" ADD CONSTRAINT "observation_media_media_id_project_id_fkey" FOREIGN KEY ("media_id", "project_id") REFERENCES "media"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
