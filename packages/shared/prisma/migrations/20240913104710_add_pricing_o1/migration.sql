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
  -- o1-preview
  ('a3f9b8c7d6e5f4a2b1c0d9e8f', NULL, 'o1-preview', '(?i)^(o1-preview)$', NULL, 0.000015, 0.000060, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "o1-preview" }'),
  
  -- o1-mini
  ('9b0c1d2e3f4a5b6c7d8e9f0a1', NULL, 'o1-mini', '(?i)^(o1-mini)$', NULL, 0.000003, 0.000012, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "o1-mini" }')
  