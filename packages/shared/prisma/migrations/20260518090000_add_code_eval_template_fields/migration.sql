-- CreateEnum
CREATE TYPE "EvalTemplateType" AS ENUM ('LLM_AS_JUDGE', 'CODE');

-- CreateEnum
CREATE TYPE "EvalTemplateSourceCodeLanguage" AS ENUM ('PYTHON', 'TYPESCRIPT');

-- AlterTable
ALTER TABLE "eval_templates"
ADD COLUMN "type" "EvalTemplateType" NOT NULL DEFAULT 'LLM_AS_JUDGE',
ADD COLUMN "source_code" VARCHAR(262144),
ADD COLUMN "source_code_language" "EvalTemplateSourceCodeLanguage";

ALTER TABLE "eval_templates"
ALTER COLUMN "prompt" DROP NOT NULL,
ALTER COLUMN "output_schema" DROP NOT NULL;
