-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SUCCESS', 'FAILURE');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN     "status_message" TEXT;
