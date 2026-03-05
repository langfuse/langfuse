-- CreateEnum
CREATE TYPE "LlmApiKeyStatus" AS ENUM ('OK', 'ERROR');

-- Add SUSPENDED to JobConfigState enum
ALTER TYPE "JobConfigState" ADD VALUE 'SUSPENDED';

-- CreateEnum
CREATE TYPE "JobConfigSuspendCode" AS ENUM (
  'LLM_401',
  'LLM_404',
  'LLM_ACCOUNT_USE_CASE_NOT_SUBMITTED',
  'LLM_INVALID_RESPONSE',
  'LLM_KEY_MISSING',
  'MODEL_CONFIG_MISSING',
  'DEFAULT_MODEL_REMOVED',
  'ERROR'
);

-- AlterTable
ALTER TABLE "job_configurations"
ADD COLUMN "status_message" TEXT,
ADD COLUMN "suspend_code" "JobConfigSuspendCode",
ADD COLUMN "suspended_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "llm_api_keys"
ADD COLUMN "status" "LlmApiKeyStatus" NOT NULL DEFAULT 'OK',
ADD COLUMN "status_message" TEXT;
