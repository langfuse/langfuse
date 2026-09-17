ALTER TABLE "organizations"
ADD COLUMN "feature_flag_org_defaults" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
