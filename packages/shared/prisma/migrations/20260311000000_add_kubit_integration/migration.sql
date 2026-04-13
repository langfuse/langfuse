-- CreateTable
CREATE TABLE "kubit_integrations" (
    "project_id" TEXT NOT NULL,
    "endpoint_url" TEXT NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "sync_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "request_timeout_seconds" INTEGER NOT NULL DEFAULT 30,
    "encrypted_aws_access_key_id" TEXT,
    "encrypted_aws_secret_access_key" TEXT,
    "encrypted_aws_session_token" TEXT,
    "aws_credentials_expiry" TIMESTAMP(3),
    "aws_kinesis_stream_name" TEXT,
    "aws_kinesis_region" TEXT,
    "aws_kinesis_partition_key" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "current_sync_max_timestamp" TIMESTAMP(3),
    "traces_synced_at" TIMESTAMP(3),
    "observations_synced_at" TIMESTAMP(3),
    "events_synced_at" TIMESTAMP(3),
    "scores_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kubit_integrations_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "kubit_integrations" ADD CONSTRAINT "kubit_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
