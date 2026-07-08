
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
  -- gpt-4o-2024-08-06
  ('clzjr85f70000ymmzg7hqffra', NULL, 'gpt-4o-2024-08-06', '(?i)^(gpt-4o-2024-08-06)$', NULL, 0.0000025, 0.000010, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4o" }')
  