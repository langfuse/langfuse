ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_definitions Array(JSON(max_dynamic_paths=32, name String, description String, parameters String)) DEFAULT [];
ALTER TABLE observations ON CLUSTER default ADD COLUMN tool_arguments Array(JSON(max_dynamic_paths=32, id String, name String, arguments String, type String, index Int32)) DEFAULT [];
