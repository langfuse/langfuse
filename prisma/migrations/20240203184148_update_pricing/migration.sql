-- This is an empty migration.

DELETE FROM models
WHERE id in ('clrkwk4cb000308l5go4b6otm', 'clrntjt89000a08jw0gcdbd5a');



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
  

  -- fix prices
  ('clrkwk4cb000308l5go4b6otm', NULL, 'gpt-3.5-turbo-16k', '(?i)^(gpt-)(35|3.5)(-turbo-16k)$', NULL, 0.000003, 0.000004, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-16k" }'),
  ('clrntjt89000a08jw0gcdbd5a', NULL, 'gpt-3.5-turbo-16k-0613', '(?i)^(gpt-)(35|3.5)(-turbo-16k-0613)$', NULL, 0.000003, 0.000004, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-16k-0613" }')