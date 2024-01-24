-- This is an empty migration.

DELETE FROM models
WHERE id in ('clrntjt89000908jwhvkz5crm', 'clrntjt89000908jwhvkz5crg', 'clrntjt89000108jwcou1af71', 'clrntjt89000208jwawjr894q', 'clrntjt89000308jw0jtfa4rs', 'clrntjt89000408jwc2c93h6i', 'clrntjt89000508jw192m64qi', 'clrntjt89000608jw4m3x5s55', 'clrp1wopz000708l079w02hkc');



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
  -- nothing earlier required for ada
  ('clrntjt89000908jwhvkz5crm', NULL, 'text-embedding-ada-002', '(?i)^(text-embedding-ada-002)$', '2022-12-06', NULL, NULL, 0.0000001, 'TOKENS', 'openai', '{"tokenizerModel": "text-embedding-ada-002"}'),
  ('clrntjt89000908jwhvkz5crg', NULL, 'text-embedding-ada-002-v2', '(?i)^(text-embedding-ada-002-v2)$', '2022-12-06', NULL, NULL, 0.0000001, 'TOKENS', 'openai', '{"tokenizerModel": "text-embedding-ada-002"}'),
  

  
  
  -- -- legacy price 2023-08-22 https://platform.openai.com/docs/deprecations/2023-07-06-gpt-and-embeddings
  ('clrntjt89000108jwcou1af71', NULL, 'text-ada-001', '(?i)^(text-ada-001)$', NULL, NULL, NULL, 0.000004, 'TOKENS', 'openai', '{"tokenizerModel": "text-ada-001"}'),
  ('clrntjt89000208jwawjr894q', NULL, 'text-babbage-001', '(?i)^(text-babbage-001)$', NULL, NULL, NULL, 0.0000005, 'TOKENS', 'openai', '{"tokenizerModel": "text-babbage-001"}'),
  ('clrntjt89000308jw0jtfa4rs', NULL, 'text-curie-001', '(?i)^(text-curie-001)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', '{"tokenizerModel": "text-curie-001"}'),
  ('clrntjt89000408jwc2c93h6i', NULL, 'text-davinci-001', '(?i)^(text-davinci-001)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', '{"tokenizerModel": "text-davinci-001"}'),
  ('clrntjt89000508jw192m64qi', NULL, 'text-davinci-002', '(?i)^(text-davinci-002)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', '{"tokenizerModel": "text-davinci-002"}'),
  ('clrntjt89000608jw4m3x5s55', NULL, 'text-davinci-003', '(?i)^(text-davinci-003)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', '{"tokenizerModel": "text-davinci-003"}'),

  ('clrs2dnql000108l46vo0gp2t', NULL, 'babbage-002', '(?i)^(babbage-002)$', NULL, 0.0000004, 0.0000016, 0.0000005, 'TOKENS', 'openai', '{"tokenizerModel": "babbage-002"}'),
  ('clrs2ds35000208l4g4b0hi3u', NULL, 'davinci-002', '(?i)^(davinci-002)$', NULL, 0.0000060, 0.0000120, 0.0000005, 'TOKENS', 'openai', '{"tokenizerModel": "davinci-002"}')




