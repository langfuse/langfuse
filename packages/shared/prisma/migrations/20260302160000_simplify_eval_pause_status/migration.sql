-- CreateEnum
CREATE TYPE "LlmApiKeyStatus" AS ENUM ('OK', 'ERROR');

-- AlterTable
ALTER TABLE "job_configurations" ADD COLUMN "status_message" TEXT;

-- AlterTable
ALTER TABLE "llm_api_keys"
ADD COLUMN "status" "LlmApiKeyStatus" NOT NULL DEFAULT 'OK',
ADD COLUMN "status_message" TEXT;
