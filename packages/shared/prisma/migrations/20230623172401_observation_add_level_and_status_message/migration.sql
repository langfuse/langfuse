-- CreateEnum
CREATE TYPE "ObservationLevel" AS ENUM ('DEBUG', 'DEFAULT', 'WARNING', 'ERROR');

-- AlterTable
ALTER TABLE "observations" ADD COLUMN     "level" "ObservationLevel" NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN     "status_message" TEXT;
