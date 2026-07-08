-- AlterTable
ALTER TABLE "users" ADD COLUMN     "feature_flags" TEXT[] DEFAULT ARRAY[]::TEXT[];
