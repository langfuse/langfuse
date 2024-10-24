-- CreateTable
CREATE TABLE "background_migrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "script" TEXT NOT NULL,
    "args" JSONB NOT NULL,

    "finished_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failed_reason" TEXT,
    "worker_id" TEXT,
    "locked_at" TIMESTAMP(3),

    CONSTRAINT "background_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "background_migrations_name_key" ON "background_migrations"("name");
