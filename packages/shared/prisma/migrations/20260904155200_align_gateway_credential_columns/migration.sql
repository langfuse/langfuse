ALTER TABLE "gateway_ai_connections"
  RENAME COLUMN "encrypted_credential" TO "encrypted_credentials";

ALTER TABLE "gateway_ai_connections"
  RENAME COLUMN "display_secret" TO "display_secret_key";
