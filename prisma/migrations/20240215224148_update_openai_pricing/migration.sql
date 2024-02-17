-- This is an empty migration.

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
  ('clsnq07bn000008l4e46v1ll8', NULL, 'gpt-4-turbo-preview', '(?i)^(gpt-4-turbo-preview)$', '2023-11-06', 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4" }')