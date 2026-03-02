-- CreateEnum
CREATE TYPE "EvalTemplateStatus" AS ENUM ('OK', 'ERROR');

-- AlterTable
ALTER TABLE "eval_templates" ADD COLUMN     "status" "EvalTemplateStatus" NOT NULL DEFAULT 'OK',
ADD COLUMN     "status_reason" JSONB,
ADD COLUMN     "status_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "llm_api_keys" ADD COLUMN     "last_error" JSONB;
