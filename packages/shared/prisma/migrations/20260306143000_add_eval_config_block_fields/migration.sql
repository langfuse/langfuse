-- CreateEnum
CREATE TYPE "EvaluatorBlockReason" AS ENUM (
  'CONNECTION_AUTH_INVALID',
  'CONNECTION_MISSING',
  'DEFAULT_MODEL_MISSING',
  'MODEL_CONFIG_INVALID',
  'MODEL_UNAVAILABLE',
  'PROVIDER_ACCOUNT_UNREADY'
);

-- AlterTable
ALTER TABLE "job_configurations"
ADD COLUMN "blocked_at" TIMESTAMP(3),
ADD COLUMN "block_reason" "EvaluatorBlockReason",
ADD COLUMN "block_message" TEXT;
