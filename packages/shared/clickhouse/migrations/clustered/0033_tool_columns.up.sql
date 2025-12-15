ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_definitions Map(String, String) DEFAULT map();
ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_calls Map(String, Array(String)) DEFAULT map();
