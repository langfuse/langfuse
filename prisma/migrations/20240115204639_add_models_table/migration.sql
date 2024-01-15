-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT,
    "model_name" TEXT NOT NULL,
    "match_pattern" TEXT NOT NULL,
    "start_date" TIMESTAMP(3),
    "input_price" DECIMAL(65,30),
    "output_price" DECIMAL(65,30),
    "total_price" DECIMAL(65,30),
    "unit" TEXT NOT NULL DEFAULT 'TOKENS',
    "tokenizer_config" JSONB NOT NULL,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
