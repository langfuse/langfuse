-- AlterTable
ALTER TABLE "datasets"
ADD COLUMN "expected_output_schema" JSONB,
ADD COLUMN "input_schema" JSONB;
