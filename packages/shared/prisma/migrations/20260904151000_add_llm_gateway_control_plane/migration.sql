-- CreateEnum
CREATE TYPE "GatewayInstrumentationMode" AS ENUM ('usage', 'full', 'none');

-- CreateEnum
CREATE TYPE "GatewayProvider" AS ENUM ('openai', 'anthropic', 'openrouter');

-- CreateEnum
CREATE TYPE "GatewayConnectionStatus" AS ENUM ('enabled', 'disabled', 'error');

-- CreateTable
CREATE TABLE "gateway_configs" (
    "organization_id" TEXT NOT NULL,
    "default_ingestion_project_id" TEXT,
    "instrumentation_mode" "GatewayInstrumentationMode" NOT NULL DEFAULT 'usage',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_configs_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "gateway_ai_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "GatewayProvider" NOT NULL,
    "encrypted_credentials" TEXT NOT NULL,
    "display_secret_key" TEXT NOT NULL,
    "created_by_id" TEXT,
    "routing_priority" INTEGER NOT NULL,
    "status" "GatewayConnectionStatus" NOT NULL DEFAULT 'enabled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_ai_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_api_key_associations" (
    "api_key_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "gateway_api_key_associations_pkey" PRIMARY KEY ("api_key_id")
);

-- CreateIndex
CREATE INDEX "gateway_configs_default_ingestion_project_id_idx"
ON "gateway_configs"("default_ingestion_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_ai_connections_organization_id_routing_priority_key"
ON "gateway_ai_connections"("organization_id", "routing_priority");

-- CreateIndex
CREATE INDEX "gateway_ai_connections_organization_id_status_routing_prio_idx"
ON "gateway_ai_connections"("organization_id", "status", "routing_priority");

-- CreateIndex
CREATE INDEX "gateway_ai_connections_created_by_id_idx"
ON "gateway_ai_connections"("created_by_id");

-- AddForeignKey
ALTER TABLE "gateway_configs"
ADD CONSTRAINT "gateway_configs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_configs"
ADD CONSTRAINT "gateway_configs_default_ingestion_project_id_fkey"
FOREIGN KEY ("default_ingestion_project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_ai_connections"
ADD CONSTRAINT "gateway_ai_connections_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_ai_connections"
ADD CONSTRAINT "gateway_ai_connections_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_api_key_associations"
ADD CONSTRAINT "gateway_api_key_associations_api_key_id_fkey"
FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
