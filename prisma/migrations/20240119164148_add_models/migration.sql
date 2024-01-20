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
  ('clrkvq6iq000008ju6c16gynt', NULL, 'gpt-4-turbo', '(?i)^(gpt-4(-1106-preview|-turbo))$', NULL, 0.01, 0.03, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkvx5gp000108juaogs54ea', NULL, 'gpt-4-turbo-vision', '(?i)^(gpt-4-vision-preview)$', NULL, 0.01, 0.03, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  
  ('clrkvyaig000208ju6lyuct5c', NULL, 'gpt-4', '(?i)^(gpt-4)$', NULL, 0.03, 0.06, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000908l537kl0rx3', NULL, 'gpt-4-0613', '(?i)^(gpt-4-0314)$', NULL, 0.03, 0.06, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkvyzgw000308jue4hse4j9', NULL, 'gpt-4-32k', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000108l5hwwh3zdi', NULL, 'gpt-4-32k-0613', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  

  ('clrkwk4cb000208l59yvb9yq8', NULL, 'gpt-3.5-turbo-1106', '(?i)^(gpt-)(35|3.5)(-turbo-1106)$', NULL, 0.001, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000408l576jl7koo', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', NULL, 0.001, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000308l5go4b6otm', NULL, 'gpt-3.5-turbo-16k', '(?i)^(gpt-)(35|3.5)(-turbo)$', NULL, 0.001, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000a08l562uc3s9g', NULL, 'gpt-3.5-turbo-instruct', '(?i)^(gpt-)(35|3.5)(-turbo)$', NULL, 0.001, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000808l51xmk4uic', NULL, 'gpt-3.5-turbo-0301', '(?i)^(gpt-)(35|3.5)(-turbo)$', NULL, 0.001, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }')

  -- legacy price 2023-11-06 https://platform.openai.com/docs/deprecations/2023-11-06-chat-model-updates
  ('clrkwk4cb000608l52a2kh2jv', NULL, 'gpt-3.5-turbo-0613', '(?i)^(gpt-)(35|3.5)(-turbo-0613)$', '2023-11-06', 0.0015, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-3.5-turbo-16k-0613', '(?i)^(gpt-)(35|3.5)(-turbo-16k-0613)$', '2023-11-06', 0.003, 0.004, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  
  -- legacy price 2023-08-22 https://platform.openai.com/docs/deprecations/2023-07-06-gpt-and-embeddings
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-ada-001', '(?i)^(text-ada-001)$', '2023-07-06', NULL, NULL, 0.0004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-babbage-001', '(?i)^(text-babbage-001)$', '2023-07-06', NULL, NULL, 0.0005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-curie-001', '(?i)^(text-curie-001)$', '2023-07-06', NULL, NULL, 0.002, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-davinci-001', '(?i)^(text-davinci-001)$', '2023-07-06', NULL, NULL, 0.02, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-davinci-002', '(?i)^(text-davinci-002)$', '2023-07-06', NULL, NULL, 0.02, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-davinci-003', '(?i)^(text-davinci-003)$', '2023-07-06', NULL, NULL, 0.02, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),

  ('clrkwk4cb000708l5bx0q5uru', NULL, 'ada', '(?i)^(ada)$', '2023-07-06', NULL, NULL, 0.0004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'babbage', '(?i)^(babbage)$', '2023-07-06', NULL, NULL, 0.0005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'curie', '(?i)^(curie)$', '2023-07-06', NULL, NULL, 0.002, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'davinci', '(?i)^(davinci)$', '2023-07-06', NULL, NULL, 0.002, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),

  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-similarity-ada-001', '(?i)^(ada)$', '2023-07-06', NULL, NULL, 0.004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-ada-doc-001', '(?i)^(babbage)$', '2023-07-06', NULL, NULL, 0.004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-ada-query-001', '(?i)^(curie)$', '2023-07-06', NULL, NULL, 0.004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'code-search-ada-code-001', '(?i)^(davinci)$', '2023-07-06', NULL, NULL, 0.004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'code-search-ada-text-001', '(?i)^(ada)$', '2023-07-06', NULL, NULL, 0.004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-similarity-babbage-001', '(?i)^(babbage)$', '2023-07-06', NULL, NULL, 0.005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-babbage-doc-001', '(?i)^(curie)$', '2023-07-06', NULL, NULL, 0.005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-babbage-query-001', '(?i)^(davinci)$', '2023-07-06', NULL, NULL, 0.005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'code-search-babbage-code-001', '(?i)^(ada)$', '2023-07-06', NULL, NULL, 0.005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'code-search-babbage-text-001', '(?i)^(babbage)$', '2023-07-06', NULL, NULL, 0.005, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-similarity-curie-001', '(?i)^(curie)$', '2023-07-06', NULL, NULL, 0.02, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-curie-doc-001', '(?i)^(davinci)$', '2023-07-06', NULL, NULL, 0.02, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-curie-query-001', '(?i)^(ada)$', '2023-07-06', NULL, NULL, 0.02, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-similarity-davinci-001', '(?i)^(babbage)$', '2023-07-06', NULL, NULL, 0.2, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-davinci-doc-001', '(?i)^(curie)$', '2023-07-06', NULL, NULL, 0.2, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'text-search-davinci-query-001', '(?i)^(davinci)$', '2023-07-06', NULL, NULL, 0.2, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),


  -- legacy price 2023-06-13 https://platform.openai.com/docs/deprecations/2023-06-13-updated-chat-models
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-3.5-turbo-0301', '(?i)^(gpt-)(35|3.5)(-turbo-0301)$', '2023-06-13', 0.0015, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-4-0314', '(?i)^(gpt-4-0314)$', '2023-06-13', 0.03, 0.06, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-4-32k-0314', '(?i)^(gpt-4-32k-0314)$', '2023-06-13', 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),


  -- 2023-03-01 https://openai.com/blog/introducing-chatgpt-and-whisper-apis announcement
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-)(35|3.5)(-turbo)$', NULL, 0.002, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-3.5-turbo-0301', '(?i)^(gpt-)(35|3.5)(-turbo-0301)$', NULL, 0.002, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),



