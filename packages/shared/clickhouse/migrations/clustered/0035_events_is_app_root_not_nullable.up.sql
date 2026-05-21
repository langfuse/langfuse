ALTER TABLE IF EXISTS events_full ON CLUSTER default ADD COLUMN IF NOT EXISTS is_app_root Bool DEFAULT false SETTINGS alter_sync = 2;
ALTER TABLE IF EXISTS events_full ON CLUSTER default UPDATE is_app_root = false WHERE isNull(is_app_root) SETTINGS mutations_sync = 2;
ALTER TABLE IF EXISTS events_full ON CLUSTER default MODIFY COLUMN IF EXISTS is_app_root Bool DEFAULT false SETTINGS alter_sync = 2;

ALTER TABLE IF EXISTS events_core ON CLUSTER default ADD COLUMN IF NOT EXISTS is_app_root Bool DEFAULT false SETTINGS alter_sync = 2;
ALTER TABLE IF EXISTS events_core ON CLUSTER default UPDATE is_app_root = false WHERE isNull(is_app_root) SETTINGS mutations_sync = 2;
ALTER TABLE IF EXISTS events_core ON CLUSTER default MODIFY COLUMN IF EXISTS is_app_root Bool DEFAULT false SETTINGS alter_sync = 2;
