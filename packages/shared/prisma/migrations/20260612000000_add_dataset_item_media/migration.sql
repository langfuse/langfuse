-- CreateTable
CREATE TABLE "dataset_item_media" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "media_id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "dataset_item_id" TEXT NOT NULL,
    -- null while pending (declared at upload, stamped when the item is written)
    "dataset_item_valid_from" TIMESTAMP(3),
    "field" TEXT NOT NULL,
    -- json_path / reference_string are filled on claim from the item JSON
    "json_path" TEXT,
    "reference_string" TEXT,

    CONSTRAINT "dataset_item_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Claimed rows only; pending rows have null valid_from/json_path (NULLs distinct)
CREATE UNIQUE INDEX "dataset_item_media_item_version_field_path_key" ON "dataset_item_media"("project_id", "dataset_item_id", "dataset_item_valid_from", "field", "json_path");

-- CreateIndex
-- Pending-row dedup: at most one pending row per (item, field, media)
CREATE UNIQUE INDEX "dataset_item_media_pending_key" ON "dataset_item_media"("project_id", "dataset_item_id", "field", "media_id") WHERE "dataset_item_valid_from" IS NULL;

-- CreateIndex
CREATE INDEX "dataset_item_media_project_id_media_id_idx" ON "dataset_item_media"("project_id", "media_id");

-- CreateIndex
CREATE INDEX "dataset_item_media_project_id_dataset_id_idx" ON "dataset_item_media"("project_id", "dataset_id");
