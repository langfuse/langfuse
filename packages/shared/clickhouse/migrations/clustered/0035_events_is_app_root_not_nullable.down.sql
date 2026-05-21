ALTER TABLE IF EXISTS events_full ON CLUSTER default MODIFY COLUMN IF EXISTS is_app_root Nullable(Bool) SETTINGS alter_sync = 2;
ALTER TABLE IF EXISTS events_core ON CLUSTER default MODIFY COLUMN IF EXISTS is_app_root Nullable(Bool) SETTINGS alter_sync = 2;
