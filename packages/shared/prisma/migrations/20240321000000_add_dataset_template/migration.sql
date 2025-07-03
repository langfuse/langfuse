-- Add template fields to Dataset model
ALTER TABLE "datasets" ADD COLUMN "input_template" JSONB;
ALTER TABLE "datasets" ADD COLUMN "expected_output_template" JSONB;
ALTER TABLE "datasets" ADD COLUMN "metadata_template" JSONB; 