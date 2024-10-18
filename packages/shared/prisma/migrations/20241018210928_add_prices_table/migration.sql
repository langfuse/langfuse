-- CreateTable
CREATE TABLE "prices" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT,
    "model_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "price" DECIMAL(65,30),

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prices_model_id_idx" ON "prices"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "prices_project_id_model_id_item_name_key" ON "prices"("project_id", "model_id", "item_name");

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
