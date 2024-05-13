INSERT INTO models (
  id,
  project_id,
  model_name,
  match_pattern,
  start_date,
  input_price,
  output_price,
  total_price,
  unit,
  tokenizer_id,
  tokenizer_config
)
VALUES
  -- gpt-4o
  -- tokenizer_config to be added when js-tiktoken is upgraded, gpt-4o is not supported yet
  ('b9854a5c92dc496b997d99d20', NULL, 'gpt-4o', '(?i)^(gpt-4o)$', NULL, 0.000005, 0.000015, NULL, 'TOKENS', 'openai', NULL),
  
  -- gpt-4o-2024-05-13
  -- tokenizer_config to be added when js-tiktoken is upgraded, gpt-4o is not supported yet
  ('b9854a5c92dc496b997d99d21', NULL, 'gpt-4o-2024-05-13', '(?i)^(gpt-4o-2024-05-13)$', NULL, 0.000005, 0.000015, NULL, 'TOKENS', 'openai', NULL)
  