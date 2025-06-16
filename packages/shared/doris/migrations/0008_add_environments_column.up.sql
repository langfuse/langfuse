ALTER TABLE traces ADD COLUMN environment String DEFAULT 'default' AFTER timestamp_date;
ALTER TABLE observations ADD COLUMN environment String DEFAULT 'default' AFTER start_time_date;
ALTER TABLE scores ADD COLUMN environment String DEFAULT 'default' AFTER name;