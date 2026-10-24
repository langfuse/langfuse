-- CreateEnum
CREATE TYPE "GroupSource" AS ENUM ('SCIM', 'SYSTEM');

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "external_id" TEXT,
    "source" "GroupSource" NOT NULL DEFAULT 'SCIM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "group_id" TEXT NOT NULL,
    "org_membership_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("group_id","org_membership_id")
);

-- CreateIndex
CREATE INDEX "groups_org_id_display_name_idx" ON "groups"("org_id", "display_name");

-- The IdP's id is unique per org when present. Prisma cannot express partial indexes.
CREATE UNIQUE INDEX "groups_org_id_external_id_key" ON "groups"("org_id", "external_id") WHERE "external_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "group_memberships_org_membership_id_idx" ON "group_memberships"("org_membership_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_org_membership_id_fkey" FOREIGN KEY ("org_membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Role assignments gain a third principal kind: group/<id>.
ALTER TABLE "role_assignments" ADD COLUMN "group_id" TEXT;

CREATE INDEX "role_assignments_group_id_idx" ON "role_assignments"("group_id");

ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_exactly_one_principal";
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_exactly_one_principal" CHECK (
    num_nonnulls("principal_user_id", "principal_api_key_id", "group_id") = 1
);

ALTER TABLE "role_assignments" DROP CONSTRAINT "role_assignments_principal_check";
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_principal_check" CHECK (
    ("user_id" IS NOT NULL AND "api_key_id" IS NULL AND "group_id" IS NULL AND "principal_id" = 'user/' || "user_id")
    OR
    ("user_id" IS NULL AND "api_key_id" IS NOT NULL AND "group_id" IS NULL AND "principal_id" = 'apiKey/' || "api_key_id")
    OR
    ("user_id" IS NULL AND "api_key_id" IS NULL AND "group_id" IS NOT NULL AND "principal_id" = 'group/' || "group_id")
);
