ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS tool_definitions Map(String, String) DEFAULT map() SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS tool_calls Array(String) DEFAULT [] SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default ADD COLUMN IF NOT EXISTS tool_call_names Array(String) DEFAULT [] SETTINGS alter_sync = 2;
