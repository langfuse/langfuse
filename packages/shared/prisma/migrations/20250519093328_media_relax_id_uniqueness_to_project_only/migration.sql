/*
  Warnings:

  - The primary key for the `media` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[project_id,id]` on the table `media` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "observation_media" DROP CONSTRAINT "observation_media_media_id_fkey";

-- DropForeignKey
ALTER TABLE "trace_media" DROP CONSTRAINT "trace_media_media_id_fkey";

-- AlterTable
ALTER TABLE "media" DROP CONSTRAINT "media_pkey";

-- AddForeignKey
ALTER TABLE "trace_media" ADD CONSTRAINT "trace_media_media_id_project_id_fkey" FOREIGN KEY ("media_id", "project_id") REFERENCES "media"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_media" ADD CONSTRAINT "observation_media_media_id_project_id_fkey" FOREIGN KEY ("media_id", "project_id") REFERENCES "media"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;
