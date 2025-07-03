-- CreateTable
CREATE TABLE "retention_configurations" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "environments" TEXT[] NOT NULL DEFAULT ARRAY['default']::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_configurations_project_id_key" ON "retention_configurations"("project_id");

-- CreateIndex
CREATE INDEX "retention_configurations_project_id_idx" ON "retention_configurations"("project_id");

-- AddForeignKey
ALTER TABLE "retention_configurations" ADD CONSTRAINT "retention_configurations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
