ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS tool_definitions;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS tool_calls;
ALTER TABLE observations ON CLUSTER default DROP COLUMN IF EXISTS tool_call_names;
