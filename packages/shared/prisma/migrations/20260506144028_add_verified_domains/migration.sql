-- CreateTable
CREATE TABLE "verified_domains" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verification_token" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verified_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "verified_domains_domain_key" ON "verified_domains"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "verified_domains_verification_token_key" ON "verified_domains"("verification_token");

-- CreateIndex
CREATE INDEX "verified_domains_organization_id_idx" ON "verified_domains"("organization_id");

-- AddForeignKey
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
