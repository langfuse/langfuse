ALTER TABLE "users"
  ADD COLUMN "sfdc_user_id" TEXT;

ALTER TABLE "organizations"
  ADD COLUMN "sfdc_org_id" TEXT;
