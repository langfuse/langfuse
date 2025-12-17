ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS tool_call_names Array(String) DEFAULT [];
