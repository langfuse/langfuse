-- CreateTable
CREATE TABLE "audit_log_staging" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "audit_log_staging_pkey" PRIMARY KEY ("id")
);

-- Every row is deleted shortly after it is inserted. Vacuum after a fixed
-- number of dead rows instead of a fraction of the table, so a backlog that
-- inflates the row estimate does not postpone vacuuming once it drains.
ALTER TABLE "audit_log_staging" SET (
    autovacuum_vacuum_scale_factor = 0,
    autovacuum_vacuum_threshold = 1000
);
