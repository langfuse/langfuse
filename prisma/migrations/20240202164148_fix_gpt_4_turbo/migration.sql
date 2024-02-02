-- This is an empty migration.

DELETE FROM models
WHERE id in ('clruwnahl00060al74fcfehas');



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
  -- https://openai.com/blog/new-embedding-models-and-api-updates
  ('clruwnahl00060al74fcfehas', NULL, 'gpt-4-turbo', '(?i)^(gpt-4-1106-preview)$', NULL, 0.00003, 0.00006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4" }'),
