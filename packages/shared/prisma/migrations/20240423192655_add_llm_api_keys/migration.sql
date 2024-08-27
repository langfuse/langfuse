-- CreateTable
CREATE TABLE "llm_api_keys" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "display_secret_key" TEXT NOT NULL,
    "secret_key" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "llm_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_id_key" ON "llm_api_keys"("id");

-- CreateIndex
CREATE INDEX "llm_api_keys_project_id_provider_idx" ON "llm_api_keys"("project_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_project_id_provider_key" ON "llm_api_keys"("project_id", "provider");

-- AddForeignKey
ALTER TABLE "llm_api_keys" ADD CONSTRAINT "llm_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
