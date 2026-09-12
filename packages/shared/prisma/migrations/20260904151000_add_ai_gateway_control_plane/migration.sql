-- Prisma does not automatically wrap PostgreSQL migrations in a transaction.
BEGIN;

-- Adding a foreign key takes SHARE ROW EXCLUSIVE on the *referenced* table, which conflicts with
-- the ROW EXCLUSIVE that every INSERT/UPDATE/DELETE takes. The FKs below reference `organizations`,
-- `projects`, `users` and `api_keys`, so for as long as this transaction is open, all writes to
-- those tables block -- including hot paths such as the `api_keys.last_used_at` update on every
-- authenticated API request. The window is milliseconds because every referencing table is created
-- empty a few lines above its FK.
--
-- The timeouts make that bound explicit: if an in-flight writer delays us, we fail fast instead of
-- parking a SHARE ROW EXCLUSIVE request at the head of the lock queue, where every subsequent
-- writer would pile up behind it.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE "GatewayIngestionMode" AS ENUM ('usage', 'full');

CREATE TYPE "GatewayProvider" AS ENUM ('openai', 'anthropic');

CREATE TYPE "GatewayConnectionStatus" AS ENUM ('enabled', 'disabled', 'error');

CREATE TABLE "gateway_configs" (
    "organization_id" TEXT NOT NULL,
    "default_ingestion_project_id" TEXT,
    "ingestion_mode" "GatewayIngestionMode" NOT NULL DEFAULT 'usage',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_configs_pkey" PRIMARY KEY ("organization_id")
);

ALTER TABLE "gateway_configs"
ADD CONSTRAINT "gateway_configs_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gateway_configs"
ADD CONSTRAINT "gateway_configs_default_ingestion_project_id_fkey"
FOREIGN KEY ("default_ingestion_project_id") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

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

CREATE UNIQUE INDEX "gateway_ai_connections_organization_id_routing_priority_key"
ON "gateway_ai_connections"("organization_id", "routing_priority");

CREATE INDEX "gateway_ai_connections_organization_id_status_routing_prior_idx"
ON "gateway_ai_connections"("organization_id", "status", "routing_priority");

ALTER TABLE "gateway_ai_connections"
ADD CONSTRAINT "gateway_ai_connections_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gateway_ai_connections"
ADD CONSTRAINT "gateway_ai_connections_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "gateway_api_key_associations" (
    "api_key_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "gateway_api_key_associations_pkey" PRIMARY KEY ("api_key_id")
);

ALTER TABLE "gateway_api_key_associations"
ADD CONSTRAINT "gateway_api_key_associations_api_key_id_fkey"
FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
