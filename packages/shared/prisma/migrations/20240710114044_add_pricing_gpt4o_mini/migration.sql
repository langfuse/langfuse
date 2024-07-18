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
  -- gpt-4o-mini
  ('clyrjp56f0000t0mzapoocd7u', NULL, 'gpt-4o-mini', '(?i)^(gpt-4o-mini)$', NULL, 0.00000015, 0.0000006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4o" }'),
  
  -- gpt-4o-mini-2024-07-18
  ('clyrjpbe20000t0mzcbwc42rg', NULL, 'gpt-4o-mini-2024-07-18', '(?i)^(gpt-4o-mini-2024-07-18)$', NULL, 0.00000015, 0.0000006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4o" }')
  