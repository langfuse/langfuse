-- CreateEnum
CREATE TYPE "GatewayAliasStatus" AS ENUM ('enabled', 'disabled');

-- CreateTable
CREATE TABLE "gateway_ai_aliases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "GatewayAliasStatus" NOT NULL DEFAULT 'enabled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_ai_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_ai_alias_targets" (
    "id" TEXT NOT NULL,
    "alias_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "provider_model" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_ai_alias_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gateway_ai_aliases_organization_id_name_key" ON "gateway_ai_aliases"("organization_id", "name");

-- CreateIndex
CREATE INDEX "gateway_ai_alias_org_created_at_id_idx" ON "gateway_ai_aliases"("organization_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_ai_alias_targets_alias_id_position_key" ON "gateway_ai_alias_targets"("alias_id", "position");

-- CreateIndex
CREATE INDEX "gateway_ai_alias_target_connection_id_idx" ON "gateway_ai_alias_targets"("connection_id");

-- AddForeignKeys
ALTER TABLE "gateway_ai_aliases" ADD CONSTRAINT "gateway_ai_aliases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKeys
ALTER TABLE "gateway_ai_alias_targets" ADD CONSTRAINT "gateway_ai_alias_targets_alias_id_fkey" FOREIGN KEY ("alias_id") REFERENCES "gateway_ai_aliases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKeys
ALTER TABLE "gateway_ai_alias_targets" ADD CONSTRAINT "gateway_ai_alias_targets_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "gateway_ai_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
