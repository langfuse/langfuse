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
  --project_id, model_name, match_pattern, start_date, input_price, output_price, total_price, unit, tokenizer_id, tokenizer_config
  --https://openai.com/pricing
  -- GPT-4 Turbo
  ('clrkvq6iq000008ju6c16gynt', NULL, 'gpt-4-turbo', '(?i)^(gpt-4-1106-preview)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-1106-preview" }'),
  ('clrkvx5gp000108juaogs54ea', NULL, 'gpt-4-turbo-vision', '(?i)^(gpt-4-vision-preview)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-vision-preview" }'),
  
  -- GPT-4
  ('clrntkjgy000f08jx79v9g1xj', NULL, 'gpt-4', '(?i)^(gpt-4)$', NULL, 0.00003, 0.00006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4" }'),
  ('clrkwk4cc000908l537kl0rx3', NULL, 'gpt-4-0613', '(?i)^(gpt-4-0613)$', NULL, 0.00003, 0.00006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-0613" }'),
  ('clrntkjgy000e08jx4x6uawoo', NULL, 'gpt-4-0314', '(?i)^(gpt-4-0314)$', NULL, 0.00003, 0.00006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-0314" }'),
  
  ('clrkvyzgw000308jue4hse4j9', NULL, 'gpt-4-32k', '(?i)^(gpt-4-32k)$', NULL, 0.00006, 0.00012, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-32k" }'),
  ('clrkwk4cb000108l5hwwh3zdi', NULL, 'gpt-4-32k-0613', '(?i)^(gpt-4-32k-0613)$', NULL, 0.00006, 0.00012, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-32k-0613" }'),
  ('clrntkjgy000d08jx0p4y9h4l', NULL, 'gpt-4-32k-0314', '(?i)^(gpt-4-32k-0314)$', NULL, 0.00006, 0.00012, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-32k-0314" }'),
  
  -- GPT 3
  
  ('clrkwk4cc000a08l562uc3s9g', NULL, 'gpt-3.5-turbo-instruct', '(?i)^(gpt-)(35|3.5)(-turbo-instruct)$', NULL, 0.0000015, 0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo" }'),
  ('clrkwk4cb000408l576jl7koo', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', '2023-11-06', 0.000001, 0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo" }'),
  ('clrkwk4cb000208l59yvb9yq8', NULL, 'gpt-3.5-turbo-1106', '(?i)^(gpt-)(35|3.5)(-turbo-1106)$', NULL, 0.000001, 0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-1106" }'),

  ('clrntkjgy000c08jxesb30p3f', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', '2023-06-27', 0.0000015, 0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo" }'),
  ('clrkwk4cc000808l51xmk4uic', NULL, 'gpt-3.5-turbo-0613', '(?i)^(gpt-)(35|3.5)(-turbo-0613)$', NULL, 0.0000015, 0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-0613" }'),

  ('clrntkjgy000b08jx769q1bah', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', NULL,  0.000002,  0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 4, "tokensPerName": -1, "tokenizerModel": "gpt-3.5-turbo" }'),
  ('clrntkjgy000a08jx4e062mr0', NULL, 'gpt-3.5-turbo-0301', '(?i)^(gpt-)(35|3.5)(-turbo-0301)$', NULL,  0.000002,  0.000002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 4, "tokensPerName": -1, "tokenizerModel": "gpt-3.5-turbo-0301" }'),


  ('clrkwk4cb000308l5go4b6otm', NULL, 'gpt-3.5-turbo-16k', '(?i)^(gpt-)(35|3.5)(-turbo-16k)$', NULL, 0.00003, 0.00004, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-16k" }'),
  ('clrntjt89000a08jw0gcdbd5a', NULL, 'gpt-3.5-turbo-16k-0613', '(?i)^(gpt-)(35|3.5)(-turbo-16k-0613)$', NULL, 0.00003, 0.00004, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-16k-0613" }'),




  -- nothing earlier required for ada
  ('clrntjt89000908jwhvkz5crm', NULL, 'text-embedding-ada-002', '(?i)^(text-embedding-ada-002)$', '2022-12-06', NULL, NULL, 0.0000001, 'TOKENS', 'openai', NULL),
  ('clrntjt89000908jwhvkz5crg', NULL, 'text-embedding-ada-002-v2', '(?i)^(text-embedding-ada-002-v2)$', '2022-12-06', NULL, NULL, 0.0000001, 'TOKENS', 'openai', NULL),
  

  
  
  -- legacy price 2023-08-22 https://platform.openai.com/docs/deprecations/2023-07-06-gpt-and-embeddings
  ('clrntjt89000108jwcou1af71', NULL, 'text-ada-001', '(?i)^(text-ada-001)$', NULL, NULL, NULL, 0.000004, 'TOKENS', 'openai', NULL),
  ('clrntjt89000208jwawjr894q', NULL, 'text-babbage-001', '(?i)^(text-babbage-001)$', NULL, NULL, NULL, 0.0000005, 'TOKENS', 'openai', NULL),
  ('clrp1wopz000708l079w02hkc', NULL, 'text-babbage-002', '(?i)^(text-babbage-002)$', NULL, NULL, NULL, 0.0000005, 'TOKENS', 'openai', NULL),
  ('clrntjt89000308jw0jtfa4rs', NULL, 'text-curie-001', '(?i)^(text-curie-001)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),
  ('clrntjt89000408jwc2c93h6i', NULL, 'text-davinci-001', '(?i)^(text-davinci-001)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),
  ('clrntjt89000508jw192m64qi', NULL, 'text-davinci-002', '(?i)^(text-davinci-002)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),
  ('clrntjt89000608jw4m3x5s55', NULL, 'text-davinci-003', '(?i)^(text-davinci-003)$', NULL, NULL, NULL, 0.00002, 'TOKENS', 'openai', NULL),


  -- claude
  ('clrnwbota000908jsgg9mb1ml', NULL, 'claude-instant-1', '(?i)^(claude-instant-1)$', NULL, 0.00000163, 0.00000551, NULL, 'CHARACTERS', 'claude', NULL),
  ('clrnwb41q000308jsfrac9uh6', NULL, 'claude-instant-1.2', '(?i)^(claude-instant-1.2)$', NULL, 0.00000163, 0.00000551, NULL, 'CHARACTERS', 'claude', NULL),
  ('clrnwbd1m000508js4hxu6o7n', NULL, 'claude-2.1', '(?i)^(claude-2.1)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  ('clrnwb836000408jsallr6u11', NULL, 'claude-2.0', '(?i)^(claude-2.0)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  ('clrnwbg2b000608jse2pp4q2d', NULL, 'claude-1.3', '(?i)^(claude-1.3)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  ('clrnwbi9d000708jseiy44k26', NULL, 'claude-1.2', '(?i)^(claude-1.2)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),
  ('clrnwblo0000808jsc1385hdp', NULL, 'claude-1.1', '(?i)^(claude-1.1)$', NULL, 0.000008, 0.000024, NULL, 'CHARACTERS', 'claude', NULL),


  -- vertex
  ('clrp1wopz000808l09nwy32xh', NULL, 'codechat-bison-32k', '(?i)^(codechat-bison-32k)$', NULL, 0.0000005, 0.0000025, NULL, 'TOKENS', 'vertex', NULL),
  ('clrp1wopz000408l05xcycki1', NULL, 'chat-bison-32k', '(?i)^(chat-bison-32k)$', NULL, 0.0000005, 0.0000025, NULL, 'TOKENS', 'vertex', NULL)



