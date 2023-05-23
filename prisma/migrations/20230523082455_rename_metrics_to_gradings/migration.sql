/*
  Warnings:

  - You are about to drop the `metrics` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "metrics" DROP CONSTRAINT "metrics_observationId_fkey";

-- DropForeignKey
ALTER TABLE "metrics" DROP CONSTRAINT "metrics_traceId_fkey";

-- DropTable
DROP TABLE "metrics";

-- CreateTable
CREATE TABLE "gradings" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "traceId" TEXT NOT NULL,
    "observationId" TEXT,

    CONSTRAINT "gradings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "gradings" ADD CONSTRAINT "gradings_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradings" ADD CONSTRAINT "gradings_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
