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
  ('b9854a5c92dc496b997d99d20', NULL, 'gpt-4o', '(?i)^(gpt-4o)$', NULL, 0.000005, 0.000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4o" }'),
  
  -- gpt-4o-2024-05-13
  ('b9854a5c92dc496b997d99d21', NULL, 'gpt-4o-2024-05-13', '(?i)^(gpt-4o-2024-05-13)$', NULL, 0.000005, 0.000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4o-2024-05-13" }')
  