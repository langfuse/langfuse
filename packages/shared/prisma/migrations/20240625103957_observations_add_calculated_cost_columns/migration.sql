-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "calculated_input_cost" DECIMAL(65,30),
ADD COLUMN     "calculated_output_cost" DECIMAL(65,30),
ADD COLUMN     "calculated_total_cost" DECIMAL(65,30),
ADD COLUMN     "internal_model_id" TEXT;
