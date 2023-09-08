-- DropIndex
DROP INDEX "api_keys_publishable_key_key";

-- RENAME column from "publishable_key" to "public_key" on table "api_keys"
ALTER TABLE "api_keys" rename column "publishable_key" to "public_key";

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_public_key_key" ON "api_keys"("public_key");
