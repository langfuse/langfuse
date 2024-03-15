/*
  Warnings:

  - Changed the type of `type` on the `observations` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('SPAN', 'EVENT', 'LLMCALL');

-- AlterTable
ALTER TABLE "observations" DROP COLUMN "type",
ADD COLUMN     "type" "ObservationType" NOT NULL;

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "traceId" TEXT NOT NULL,
    "observationId" TEXT,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
