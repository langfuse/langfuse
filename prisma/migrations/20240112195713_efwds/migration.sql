-- AlterTable
ALTER TABLE "models" ALTER COLUMN "start_date" DROP NOT NULL,
ALTER COLUMN "prompt_price" DROP NOT NULL,
ALTER COLUMN "completion_price" DROP NOT NULL,
ALTER COLUMN "total_price" DROP NOT NULL;
