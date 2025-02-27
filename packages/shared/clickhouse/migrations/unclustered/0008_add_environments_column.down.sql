ALTER TABLE traces DROP COLUMN IF EXISTS environment;
ALTER TABLE observations DROP COLUMN IF EXISTS environment;
ALTER TABLE scores DROP COLUMN IF EXISTS environment;
