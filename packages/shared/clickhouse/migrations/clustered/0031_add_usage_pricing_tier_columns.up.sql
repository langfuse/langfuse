ALTER TABLE observations ON CLUSTER default ADD COLUMN usage_pricing_tier_id Nullable(String) AFTER total_cost;
ALTER TABLE observations ON CLUSTER default ADD COLUMN usage_pricing_tier_name Nullable(String) AFTER usage_pricing_tier_id;
