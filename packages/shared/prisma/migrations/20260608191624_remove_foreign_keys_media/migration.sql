-- DropForeignKey
ALTER TABLE "observation_media" DROP CONSTRAINT "observation_media_project_id_fkey";

-- DropForeignKey
ALTER TABLE "trace_media" DROP CONSTRAINT "trace_media_project_id_fkey";

-- AddForeignKey
ALTER TABLE "observation_media" ADD CONSTRAINT "observation_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
