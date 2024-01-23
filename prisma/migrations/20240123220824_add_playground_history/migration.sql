-- CreateTable
CREATE TABLE "playground_histories" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT,
    "key_id" TEXT,

    CONSTRAINT "playground_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_api_keys" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "encrypted_key" BYTEA NOT NULL,
    "name" TEXT,
    "model" TEXT,
    "provider" TEXT,
    "project_id" TEXT NOT NULL,

    CONSTRAINT "llm_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playground_histories_project_id_idx" ON "playground_histories"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_id_key" ON "llm_api_keys"("id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_api_keys_encrypted_key_key" ON "llm_api_keys"("encrypted_key");

-- CreateIndex
CREATE INDEX "llm_api_keys_project_id_idx" ON "llm_api_keys"("project_id");

-- AddForeignKey
ALTER TABLE "playground_histories" ADD CONSTRAINT "playground_histories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_histories" ADD CONSTRAINT "playground_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playground_histories" ADD CONSTRAINT "playground_histories_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "llm_api_keys"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_api_keys" ADD CONSTRAINT "llm_api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
