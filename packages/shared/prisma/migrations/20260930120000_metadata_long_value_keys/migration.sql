-- CreateTable
CREATE TABLE "metadata_long_value_keys" (
    "project_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "max_value_length" INTEGER NOT NULL,
    "example_trace_id" TEXT NOT NULL,
    "example_observation_id" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_long_value_keys_pkey" PRIMARY KEY ("project_id","key")
);

-- AddForeignKey
ALTER TABLE "metadata_long_value_keys" ADD CONSTRAINT "metadata_long_value_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
