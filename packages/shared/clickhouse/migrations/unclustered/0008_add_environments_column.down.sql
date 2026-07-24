ALTER TABLE traces DROP COLUMN IF EXISTS environment SETTINGS alter_sync = 2;
ALTER TABLE observations DROP COLUMN IF EXISTS environment SETTINGS alter_sync = 2;
ALTER TABLE scores DROP COLUMN IF EXISTS environment SETTINGS alter_sync = 2;
