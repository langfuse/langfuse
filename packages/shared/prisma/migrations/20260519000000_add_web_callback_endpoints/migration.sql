-- CreateTable
CREATE TABLE "web_callback_endpoints" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "toast_message" TEXT NOT NULL DEFAULT 'Callback sent',
    "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
    "request_headers" JSONB,
    "display_headers" JSONB,

    CONSTRAINT "web_callback_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_callback_endpoints_project_id_idx" ON "web_callback_endpoints"("project_id");

-- CreateIndex
CREATE INDEX "web_callback_endpoints_project_id_enabled_idx" ON "web_callback_endpoints"("project_id", "enabled");

-- AddForeignKey
ALTER TABLE "web_callback_endpoints" ADD CONSTRAINT "web_callback_endpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
