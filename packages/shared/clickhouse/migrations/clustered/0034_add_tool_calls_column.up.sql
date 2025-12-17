ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_calls Array(String) DEFAULT [];
