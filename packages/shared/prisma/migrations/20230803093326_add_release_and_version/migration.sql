-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "release" TEXT,
ADD COLUMN     "version" TEXT;
