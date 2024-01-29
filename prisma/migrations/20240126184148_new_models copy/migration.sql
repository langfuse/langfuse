-- This is an empty migration.

DELETE FROM models
WHERE id in ('clrp1wopz000808l09nwy32xh', 'clrp1wopz000408l05xcycki1','clrs2dnql000108l46vo0gp2t', 'clrs2ds35000208l4g4b0hi3u');



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
  -- tokenizers are best guess for embedding models
  ('clruwn3pc00010al7bl611c8o', NULL, 'text-embedding-3-small', '(?i)^(text-embedding-3-small)$', NULL, NULL, NULL, 0.00000002, 'TOKENS', 'openai', '{"tokenizerModel": "text-embedding-ada-002"}'),
  ('clruwn76700020al7gp8e4g4l', NULL, 'text-embedding-ada-002-v2', '(?i)^(text-embedding-3-large)$', NULL, NULL, NULL, 0.00000013, 'TOKENS', 'openai', '{"tokenizerModel": "text-embedding-ada-002"}'),
  
  ('clruwnahl00030al7ab9rark7', NULL, 'gpt-3.5-turbo-0125', '(?i)^(gpt-)(35|3.5)(-turbo-0125)$', NULL, 0.0000005, 0.0000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo" }'),
  ('clruwnahl00040al78f1lb0at', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', '2024-02-08', 0.0000005, 0.0000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo" }'),

  ('clruwnahl00050al796ck3p44', NULL, 'gpt-4-0125-preview', '(?i)^(gpt-4-0125-preview)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4" }'),
  ('clruwnahl00060al74fcfehas', NULL, 'gpt-4-turbo-preview', '(?i)^(gpt-4-turbo-preview)$', NULL, 0.00003, 0.00006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4" }'),

  -- fix tokenizer for vertx
  ('clrp1wopz000808l09nwy32xh', NULL, 'codechat-bison-32k', '(?i)^(codechat-bison-32k)$', NULL, 0.0000005, 0.0000025, NULL, 'TOKENS', NULL, NULL),
  ('clrp1wopz000408l05xcycki1', NULL, 'chat-bison-32k', '(?i)^(chat-bison-32k)$', NULL, 0.0000005, 0.0000025, NULL, 'TOKENS', NULL, NULL),

  -- fix prices
  ('clrs2dnql000108l46vo0gp2t', NULL, 'babbage-002', '(?i)^(babbage-002)$', NULL, 0.0000004, 0.0000016, NULL, 'TOKENS', 'openai', '{"tokenizerModel": "babbage-002"}'),
  ('clrs2ds35000208l4g4b0hi3u', NULL, 'davinci-002', '(?i)^(davinci-002)$', NULL, 0.0000060, 0.0000120, NULL, 'TOKENS', 'openai', '{"tokenizerModel": "davinci-002"}')