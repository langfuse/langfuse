ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS tool_definitions Map(String, String) DEFAULT map();
