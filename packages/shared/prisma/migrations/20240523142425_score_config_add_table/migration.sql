-- CreateEnum
CREATE TYPE "ScoreDataType" AS ENUM ('CATEGORICAL', 'NUMERIC');

-- AlterTable
ALTER TABLE "scores" ADD COLUMN     "config_id" TEXT,
ADD COLUMN     "data_type" "ScoreDataType" NOT NULL DEFAULT 'NUMERIC',
ADD COLUMN     "string_value" TEXT;

-- CreateTable
CREATE TABLE "score_configs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data_type" "ScoreDataType" NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "categories" JSONB,
    "description" TEXT,

    CONSTRAINT "score_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "score_configs_data_type_idx" ON "score_configs"("data_type");

-- CreateIndex
CREATE INDEX "score_configs_is_archived_idx" ON "score_configs"("is_archived");

-- CreateIndex
CREATE INDEX "score_configs_project_id_idx" ON "score_configs"("project_id");

-- CreateIndex
CREATE INDEX "score_configs_categories_idx" ON "score_configs"("categories");

-- CreateIndex
CREATE UNIQUE INDEX "score_configs_id_project_id_key" ON "score_configs"("id", "project_id");

-- AddForeignKey
ALTER TABLE "score_configs" ADD CONSTRAINT "score_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
