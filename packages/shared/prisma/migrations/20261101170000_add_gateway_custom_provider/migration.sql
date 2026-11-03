-- AlterEnum
ALTER TYPE "GatewayProvider" ADD VALUE 'custom';

-- AlterTable
ALTER TABLE "gateway_ai_connections" ADD COLUMN "base_url" TEXT;
ALTER TABLE "gateway_ai_connections" ADD COLUMN "supported_routes" JSONB;
