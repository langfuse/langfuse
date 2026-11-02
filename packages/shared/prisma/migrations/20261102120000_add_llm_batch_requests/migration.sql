-- CreateEnum
CREATE TYPE "LlmBatchRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "llm_batch_requests" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "job_execution_id" TEXT NOT NULL,
    "llm_api_key_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "LlmBatchRequestStatus" NOT NULL DEFAULT 'PENDING',
    "request" JSONB NOT NULL,
    "response" JSONB,
    "error" TEXT,
    "provider_job_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "resume_queue_name" TEXT,
    "resume_job_name" TEXT,
    "resume_job_data" JSONB,
    "resume_claimed_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),

    CONSTRAINT "llm_batch_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_batch_requests_status_llm_api_key_id_model_created_at_idx" ON "llm_batch_requests"("status", "llm_api_key_id", "model", "created_at");

-- CreateIndex
CREATE INDEX "llm_batch_requests_provider_job_id_idx" ON "llm_batch_requests"("provider_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "llm_batch_requests_project_id_job_execution_id_key" ON "llm_batch_requests"("project_id", "job_execution_id");

-- AddForeignKey
ALTER TABLE "llm_batch_requests" ADD CONSTRAINT "llm_batch_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

