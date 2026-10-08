-- CreateTable
CREATE TABLE "topics_model_configs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    -- Same columns as Evaluator, set when a configured connection is no longer valid.
    "blocked_at" TIMESTAMP(3),
    "block_reason" "EvaluatorBlockReason",
    "block_message" TEXT,
    "summary_llm_api_key_id" TEXT,
    "summary_model" TEXT,
    "embedding_llm_api_key_id" TEXT,
    "embedding_model" TEXT,
    "embedding_dimensions" INTEGER NOT NULL DEFAULT 1024,
    "clustering_llm_api_key_id" TEXT,
    "clustering_model" TEXT,

    CONSTRAINT "topics_model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "topics_model_configs_project_id_key" ON "topics_model_configs"("project_id");

-- CreateIndex
CREATE INDEX "topics_model_configs_summary_llm_api_key_id_idx" ON "topics_model_configs"("summary_llm_api_key_id");

-- CreateIndex
CREATE INDEX "topics_model_configs_embedding_llm_api_key_id_idx" ON "topics_model_configs"("embedding_llm_api_key_id");

-- CreateIndex
CREATE INDEX "topics_model_configs_clustering_llm_api_key_id_idx" ON "topics_model_configs"("clustering_llm_api_key_id");

-- AddForeignKey
ALTER TABLE "topics_model_configs" ADD CONSTRAINT "topics_model_configs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics_model_configs" ADD CONSTRAINT "topics_model_configs_summary_llm_api_key_id_fkey" FOREIGN KEY ("summary_llm_api_key_id") REFERENCES "llm_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics_model_configs" ADD CONSTRAINT "topics_model_configs_embedding_llm_api_key_id_fkey" FOREIGN KEY ("embedding_llm_api_key_id") REFERENCES "llm_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics_model_configs" ADD CONSTRAINT "topics_model_configs_clustering_llm_api_key_id_fkey" FOREIGN KEY ("clustering_llm_api_key_id") REFERENCES "llm_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
