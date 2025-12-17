ALTER TABLE observations ADD COLUMN IF NOT EXISTS tool_definitions Map(String, String) DEFAULT map();
