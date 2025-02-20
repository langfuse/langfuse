ALTER TABLE traces ON CLUSTER default DROP COLUMN IF EXISTS environment;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS environment;
ALTER TABLE scores ON CLUSTER default DROP COLUMN IF EXISTS environment;
