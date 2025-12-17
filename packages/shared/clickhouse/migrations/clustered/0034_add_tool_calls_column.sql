ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS tool_calls Array(String) DEFAULT [];
