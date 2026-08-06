ALTER TABLE observations ADD COLUMN usage_pricing_tier_id Nullable(String) SETTINGS alter_sync = 2;
ALTER TABLE observations ADD COLUMN usage_pricing_tier_name Nullable(String) SETTINGS alter_sync = 2;
