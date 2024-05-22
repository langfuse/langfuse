-- CreateEnum
CREATE TYPE "ScoreDataType" AS ENUM ('CATEGORICAL', 'CONTINUOUS');

-- CreateTable
CREATE TABLE "annotation_config" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" "ScoreDataType" NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "categories" JSONB,
    "author_user_id" TEXT,
    "description" TEXT,

    CONSTRAINT "annotation_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annotation_config_dataType_idx" ON "annotation_config"("dataType");

-- CreateIndex
CREATE INDEX "annotation_config_is_archived_idx" ON "annotation_config"("is_archived");

-- CreateIndex
CREATE INDEX "annotation_config_project_id_idx" ON "annotation_config"("project_id");

-- CreateIndex
CREATE INDEX "annotation_config_categories_idx" ON "annotation_config"("categories");

-- CreateIndex
CREATE INDEX "annotation_config_author_user_id_idx" ON "annotation_config"("author_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "annotation_config_id_project_id_key" ON "annotation_config"("id", "project_id");
