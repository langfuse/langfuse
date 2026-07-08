-- CreateTable
CREATE TABLE "posthog_integrations" (
    "project_id" TEXT NOT NULL,
    "encrypted_posthog_api_key" TEXT NOT NULL,
    "posthog_host_name" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "posthog_integrations_pkey" PRIMARY KEY ("project_id")
);

-- CreateIndex
CREATE INDEX "posthog_integrations_project_id_idx" ON "posthog_integrations"("project_id");

-- AddForeignKey
ALTER TABLE "posthog_integrations" ADD CONSTRAINT "posthog_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
