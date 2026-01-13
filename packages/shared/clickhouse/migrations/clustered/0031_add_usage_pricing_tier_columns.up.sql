ALTER TABLE observations ON CLUSTER default ADD COLUMN usage_pricing_tier_id Nullable(String);
ALTER TABLE observations ON CLUSTER default ADD COLUMN usage_pricing_tier_name Nullable(String);
