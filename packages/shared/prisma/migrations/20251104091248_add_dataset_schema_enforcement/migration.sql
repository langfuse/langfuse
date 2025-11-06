-- AlterTable
ALTER TABLE "datasets"
ADD COLUMN "expected_output_schema" JSON,
ADD COLUMN "input_schema" JSON;
