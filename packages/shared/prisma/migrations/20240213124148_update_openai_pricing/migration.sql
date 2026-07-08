-- This is an empty migration.

DELETE FROM models
WHERE id in ('clruwnahl00040al78f1lb0at');



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
  ('clruwnahl00040al78f1lb0at', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', '2024-02-16', 0.0000005, 0.0000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo" }'),
  ('clsk9lntu000008jwfc51bbqv', NULL, 'gpt-3.5-turbo-16k', '(?i)^(gpt-)(35|3.5)(-turbo-16k)$', '2024-02-16', 0.0000005, 0.0000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-16k" }')