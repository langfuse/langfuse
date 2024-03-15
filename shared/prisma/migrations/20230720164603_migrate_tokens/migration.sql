-- This is an empty migration.
UPDATE observations
  SET prompt_tokens = CAST(usage::json->>'promptTokens' AS INTEGER),
  completion_tokens = CAST(usage::json->>'completionTokens' AS INTEGER),
  total_tokens = CAST(usage::json->>'totalTokens' AS INTEGER);