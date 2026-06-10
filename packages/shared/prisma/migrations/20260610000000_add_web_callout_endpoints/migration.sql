-- CreateTable
CREATE TABLE "web_callout_endpoints" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "toast_message" TEXT NOT NULL DEFAULT 'Callout sent',
    "request_headers" TEXT,
    "request_header_keys" TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

    CONSTRAINT "web_callout_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "web_callout_endpoints_project_id_idx" ON "web_callout_endpoints"("project_id");

-- CreateIndex
CREATE INDEX "web_callout_endpoints_project_id_enabled_idx" ON "web_callout_endpoints"("project_id", "enabled");

-- AddForeignKey
ALTER TABLE "web_callout_endpoints" ADD CONSTRAINT "web_callout_endpoints_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
