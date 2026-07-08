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
  -- https://platform.openai.com/docs/models/continuous-model-upgrades
  ('cluvpl4ls000008l6h2gx3i07', NULL, 'gpt-4-turbo', '(?i)^(gpt-4-turbo)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-1106-preview" }')