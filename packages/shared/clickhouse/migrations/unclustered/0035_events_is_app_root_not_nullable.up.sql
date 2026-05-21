ALTER TABLE IF EXISTS events_full ADD COLUMN IF NOT EXISTS is_app_root Bool DEFAULT false;
ALTER TABLE IF EXISTS events_full UPDATE is_app_root = false WHERE isNull(is_app_root) SETTINGS mutations_sync = 2;
ALTER TABLE IF EXISTS events_full MODIFY COLUMN IF EXISTS is_app_root Bool DEFAULT false;

ALTER TABLE IF EXISTS events_core ADD COLUMN IF NOT EXISTS is_app_root Bool DEFAULT false;
ALTER TABLE IF EXISTS events_core UPDATE is_app_root = false WHERE isNull(is_app_root) SETTINGS mutations_sync = 2;
ALTER TABLE IF EXISTS events_core MODIFY COLUMN IF EXISTS is_app_root Bool DEFAULT false;
