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


-- Create a temporary table to store the new prices for user-defined models
CREATE TEMPORARY TABLE temp_prices AS
SELECT 
    id AS model_id,
    'input' AS usage_type,
    input_price AS price
FROM models
WHERE project_id IS NOT NULL AND input_price IS NOT NULL
UNION ALL
SELECT 
    id AS model_id,
    'output' AS usage_type,
    output_price AS price
FROM models
WHERE project_id IS NOT NULL AND output_price IS NOT NULL
UNION ALL
SELECT 
    id AS model_id,
    'total' AS usage_type,
    total_price AS price
FROM models
WHERE project_id IS NOT NULL AND total_price IS NOT NULL;

-- Insert into prices table
INSERT INTO prices (id, created_at, updated_at, model_id, usage_type, price)
SELECT 
    md5(random()::text || clock_timestamp()::text || model_id::text || usage_type::text)::uuid AS id,
    NOW() AS created_at,
    NOW() AS updated_at,
    model_id,
    usage_type,
    price
FROM temp_prices
ON CONFLICT (model_id, usage_type) DO NOTHING;

-- Drop the temporary table
DROP TABLE temp_prices;