ALTER TABLE IF EXISTS events_full MODIFY COLUMN IF EXISTS is_app_root Nullable(Bool);
ALTER TABLE IF EXISTS events_core MODIFY COLUMN IF EXISTS is_app_root Nullable(Bool);
