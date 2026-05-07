ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS tool_definitions SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS tool_calls SETTINGS alter_sync = 2;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS tool_call_names SETTINGS alter_sync = 2;
