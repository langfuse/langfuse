ALTER TABLE observations ADD COLUMN IF NOT EXISTS tool_call_names Array(String) DEFAULT [];
