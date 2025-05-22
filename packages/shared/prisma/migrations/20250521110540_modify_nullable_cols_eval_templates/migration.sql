-- AlterTable
ALTER TABLE "eval_templates" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "eval_templates" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "eval_templates" ALTER COLUMN "provider" DROP NOT NULL;
ALTER TABLE "eval_templates" ALTER COLUMN "model_params" DROP NOT NULL;
ALTER TABLE "eval_templates" ADD COLUMN "partner" TEXT;