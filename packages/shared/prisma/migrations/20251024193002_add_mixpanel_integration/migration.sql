-- CreateTable
CREATE TABLE "mixpanel_integrations" (
    "project_id" TEXT NOT NULL,
    "encrypted_mixpanel_project_token" TEXT NOT NULL,
    "mixpanel_region" TEXT NOT NULL,
    "last_sync_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mixpanel_integrations_pkey" PRIMARY KEY ("project_id")
);

-- AddForeignKey
ALTER TABLE "mixpanel_integrations" ADD CONSTRAINT "mixpanel_integrations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
