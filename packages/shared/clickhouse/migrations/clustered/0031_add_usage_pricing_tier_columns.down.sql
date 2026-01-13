ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS usage_pricing_tier_name;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS usage_pricing_tier_id;
