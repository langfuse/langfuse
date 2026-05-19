ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS usage_pricing_tier_name SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS usage_pricing_tier_id SETTINGS alter_sync = 2;
