-- CockroachDB has no autovacuum storage parameters (MVCC garbage collection is
-- configured per zone), so the table is created without them.

-- CreateTable
CREATE TABLE "audit_log_staging" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "audit_log_staging_pkey" PRIMARY KEY ("id")
);
