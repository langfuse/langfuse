-- CreateTable
CREATE TABLE "traces" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "status_message" TEXT,

    CONSTRAINT "traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "attributes" JSONB NOT NULL,
    "parentObservationId" TEXT,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "traces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_parentObservationId_fkey" FOREIGN KEY ("parentObservationId") REFERENCES "observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
