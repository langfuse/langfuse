ALTER TABLE traces ON CLUSTER default DROP COLUMN IF EXISTS environment SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS environment SETTINGS alter_sync = 2;
ALTER TABLE scores ON CLUSTER default DROP COLUMN IF EXISTS environment SETTINGS alter_sync = 2;
