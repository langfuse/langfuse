ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_call_names Array(String) DEFAULT [];
