-- Pending claims are now shareable across orgs; verified claims remain
-- exclusive. Drop the global uniqueness on `domain` and replace it with:
--   1. a per-org uniqueness on (organization_id, domain) for idempotency
--   2. a partial unique index on `domain` where verified_at IS NOT NULL,
--      so at most one org can hold a verified claim for any given domain.

DROP INDEX "verified_domains_domain_key";

CREATE UNIQUE INDEX "verified_domains_organization_id_domain_key"
  ON "verified_domains" ("organization_id", "domain");

CREATE UNIQUE INDEX "verified_domains_domain_verified_key"
  ON "verified_domains" ("domain")
  WHERE "verified_at" IS NOT NULL;
