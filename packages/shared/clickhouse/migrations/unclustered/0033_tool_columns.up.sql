ALTER TABLE observations ADD COLUMN tool_definitions Map(String, String) DEFAULT map();
ALTER TABLE observations ADD COLUMN tool_calls Array(String) DEFAULT [];
ALTER TABLE observations ADD COLUMN tool_call_names Array(String) DEFAULT [];
