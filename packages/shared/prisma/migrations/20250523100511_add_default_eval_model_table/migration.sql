-- CreateTable
CREATE TABLE "default_llm_models" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "llm_api_key_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_params" JSONB,

    CONSTRAINT "default_llm_models_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "default_llm_models" ADD CONSTRAINT "default_llm_models_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "default_llm_models" ADD CONSTRAINT "default_llm_models_llm_api_key_id_fkey" FOREIGN KEY ("llm_api_key_id") REFERENCES "llm_api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddUniqueConstraint
ALTER TABLE "default_llm_models" ADD CONSTRAINT "default_llm_models_project_id_key" UNIQUE ("project_id");
