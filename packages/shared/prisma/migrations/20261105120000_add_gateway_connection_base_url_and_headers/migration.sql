ALTER TABLE "gateway_ai_connections" ADD COLUMN IF NOT EXISTS "base_url" TEXT;
ALTER TABLE "gateway_ai_connections" ADD COLUMN IF NOT EXISTS "extra_headers" TEXT;
ALTER TABLE "gateway_ai_connections" ADD COLUMN IF NOT EXISTS "extra_header_keys" TEXT[] DEFAULT ARRAY[]::TEXT[];
