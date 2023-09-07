-- CreateTable
CREATE TABLE "cron_jobs" (
    "name" TEXT NOT NULL,
    "last_run" TIMESTAMP(3),

    CONSTRAINT "cron_jobs_pkey" PRIMARY KEY ("name")
);
