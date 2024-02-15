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
  -- according to email, gpt-3.5-turbo and gpt-3.5-turbo-16k will point to 0125 models as of 2024-02-16
  -- gpt-3.5-turbo-0125 now supports 16k token length. 16k model will point to regular 3.5 turbo model according to mail.
  ('clruwnahl00060al74fcfehas', NULL, 'gpt-4-turbo-preview', '(?i)^(gpt-4-turbo-preview)$', '2023-11-06', 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4" }'),