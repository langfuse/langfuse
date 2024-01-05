-- AlterTable
ALTER TABLE "traces" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
