-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "input_cost" DECIMAL(65,30),
ADD COLUMN     "output_cost" DECIMAL(65,30),
ADD COLUMN     "total_cost" DECIMAL(65,30);
