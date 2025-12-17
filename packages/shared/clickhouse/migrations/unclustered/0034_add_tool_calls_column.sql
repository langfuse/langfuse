ALTER TABLE observations ADD COLUMN IF NOT EXISTS tool_calls Array(String) DEFAULT [];
