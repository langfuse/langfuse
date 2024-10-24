-- CreateTable
CREATE TABLE "prices" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_id" TEXT NOT NULL,
    "usage_type" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prices_model_id_idx" ON "prices"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "prices_model_id_usage_type_key" ON "prices"("model_id", "usage_type");

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Alter Table to make unit column nullable
ALTER TABLE "models" ALTER COLUMN "unit" DROP NOT NULL;
