-- Allow LLM connections to be owned by either a project or an organization.
ALTER TABLE "llm_api_keys"
  ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
  ALTER COLUMN "project_id" DROP NOT NULL;

ALTER TABLE "llm_api_keys"
  ADD CONSTRAINT "llm_api_keys_owner_check"
    CHECK (num_nonnulls("project_id", "organization_id") = 1),
  ADD CONSTRAINT "llm_api_keys_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "llm_api_keys_organization_id_provider_key"
  ON "llm_api_keys"("organization_id", "provider");
