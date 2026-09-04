ALTER TABLE "api_keys"
  ADD COLUMN IF NOT EXISTS "is_gateway_key" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gateway_ai_connections'
      AND column_name = 'encrypted_credential'
  ) THEN
    ALTER TABLE "gateway_ai_connections"
      RENAME COLUMN "encrypted_credential" TO "encrypted_credentials";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gateway_ai_connections'
      AND column_name = 'display_secret'
  ) THEN
    ALTER TABLE "gateway_ai_connections"
      RENAME COLUMN "display_secret" TO "display_secret_key";
  END IF;
END
$$;
