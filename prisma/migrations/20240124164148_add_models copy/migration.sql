-- This is an empty migration.

DELETE FROM models
WHERE id in ('clrntjt89000908jwhvkz5crm');



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
  ('clrntjt89000908jwhvkz5crm', NULL, 'text-embedding-ada-002', '(?i)^(text-embedding-ada-002)$', '2022-12-06', NULL, NULL, 0.0000001, 'TOKENS', 'openai', '{"tokenizerModel": "text-embedding-ada-002"}')
  -- ('clrntjt89000908jwhvkz5crg', NULL, 'text-embedding-ada-002-v2', '(?i)^(text-embedding-ada-002-v2)$', '2022-12-06', NULL, NULL, 0.0000001, 'TOKENS', 'openai', NULL),
  

  
  
  -- -- legacy price 2023-08-22 https://platform.openai.com/docs/deprecations/2023-07-06-gpt-and-embeddings
  -- ('clrntjt89000108jwcou1af71', NULL, 'text-ada-001', '(?i)^(text-ada-001)$', NULL, NULL, NULL, 0.000004, 'TOKENS', 'openai', NULL),
  -- ('clrntjt89000208jwawjr894q', NULL, 'text-babbage-001', '(?i)^(text-babbage-001)$', NULL, NULL, NULL, 0.0000005, 'TOKENS', 'openai', NULL),
  -- ('clrp1wopz000708l079w02hkc', NULL, 'text-babbage-002', '(?i)^(text-babbage-002)$', NULL, NULL, NULL, 0.0000005, 'TOKENS', 'openai', NULL),
  -- ('clrntjt89000308jw0jtfa4rs', NULL, 'text-curie-001', '(?i)^(text-curie-001)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),
  -- ('clrntjt89000408jwc2c93h6i', NULL, 'text-davinci-001', '(?i)^(text-davinci-001)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),
  -- ('clrntjt89000508jw192m64qi', NULL, 'text-davinci-002', '(?i)^(text-davinci-002)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),
  -- ('clrntjt89000608jw4m3x5s55', NULL, 'text-davinci-003', '(?i)^(text-davinci-003)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),


  -- -- claude
  -- ('clrnwbota000908jsgg9mb1ml', NULL, 'claude-instant-1', '(?i)^(claude-instant-1)$', NULL, 0.00000163, 0.00000551, NULL, 'CHARACTERS', 'claude', NULL),
  -- ('clrnwb41q000308jsfrac9uh6', NULL, 'claude-instant-1.2', '(?i)^(claude-instant-1.2)$', NULL, 0.00000163, 0.00000551, NULL, 'CHARACTERS', 'claude', NULL),
  -- ('clrnwbd1m000508js4hxu6o7n', NULL, 'claude-2.1', '(?i)^(claude-2.1)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  -- ('clrnwb836000408jsallr6u11', NULL, 'claude-2.0', '(?i)^(claude-2.0)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  -- ('clrnwbg2b000608jse2pp4q2d', NULL, 'claude-1.3', '(?i)^(claude-1.3)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  -- ('clrnwbi9d000708jseiy44k26', NULL, 'claude-1.2', '(?i)^(claude-1.2)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  -- ('clrnwblo0000808jsc1385hdp', NULL, 'claude-1.1', '(?i)^(claude-1.1)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),


  -- -- vertex
  -- ('clrp1wopz000808l09nwy32xh', NULL, 'codechat-bison-32k', '(?i)^(codechat-bison-32k)$', NULL, 0.0000005, 0.0000025, NULL, 'TOKENS', 'vertex', NULL),
  -- ('clrp1wopz000408l05xcycki1', NULL, 'chat-bison-32k', '(?i)^(chat-bison-32k)$', NULL, 0.0000005, 0.0000025, NULL, 'TOKENS', 'vertex', NULL)



