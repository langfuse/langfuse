-- AlterTable
ALTER TABLE "models" ALTER COLUMN "unit" DROP DEFAULT;

-- AlterTable
ALTER TABLE "observations" ALTER COLUMN "unit" DROP NOT NULL,
ALTER COLUMN "unit" DROP DEFAULT;
