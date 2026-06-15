-- AlterTable
ALTER TABLE "media" ADD COLUMN "retained_by_dataset_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "dataset_item_media" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "dataset_item_id" TEXT NOT NULL,
    "dataset_item_valid_from" TIMESTAMP(3) NOT NULL,
    "field" TEXT NOT NULL,
    "json_path" TEXT NOT NULL,
    "reference_string" TEXT NOT NULL,

    CONSTRAINT "dataset_item_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dataset_item_media_item_version_field_path_key" ON "dataset_item_media"("project_id", "dataset_item_id", "dataset_item_valid_from", "field", "json_path");

-- CreateIndex
CREATE INDEX "dataset_item_media_project_id_media_id_idx" ON "dataset_item_media"("project_id", "media_id");

-- CreateIndex
CREATE INDEX "dataset_item_media_project_id_dataset_id_idx" ON "dataset_item_media"("project_id", "dataset_id");
