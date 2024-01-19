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
  ('clrkvq6iq000008ju6c16gynt', NULL, 'gpt-4-turbo', '(?i)^(gpt-4)(-turbo|-1106-preview)$', NULL, 0.01, 0.03, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkvx5gp000108juaogs54ea', NULL, 'gpt-4-turbo-vision', '(?i)^(gpt-4-1106-vision-preview)$', NULL, 0.01, 0.03, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkvyaig000208ju6lyuct5c', NULL, 'gpt-4', '(?i)^(gpt-4)$', NULL, 0.03, 0.06, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkvyzgw000308jue4hse4j9', NULL, 'gpt-4-32k', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000208l59yvb9yq8', NULL, 'gpt-3.5-turbo-1106', '(?i)^(gpt-)(35|3.5)(-turbo-1106)$', NULL, 0.001, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000408l576jl7koo', NULL, 'gpt-3.5-turbo-instruct', '(?i)^(gpt-)(35|3.5)(-turbo-instruct)$', NULL, 0.0015, 0.002, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000908l537kl0rx3', NULL, 'ada-v2', '(?i)^(text-embedding-ada-002)$', NULL, NULL, NULL, 0.0001, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000a08l562uc3s9g', NULL, 'davinci-002', '(?i)^(davinci-002)$', NULL, NULL, NULL, 0.0002, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000a08l562uc3s9g', NULL, 'babbage-002', '(?i)^(babbage-002)$', NULL, NULL, NULL, 0.0004, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  
  
  
  ('clrkwk4cb000308l5go4b6otm', NULL, 'gpt-3.5-turbo-16k', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000108l5hwwh3zdi', NULL, 'gpt-3.5-turbo', '(?i)^(gpt-(35|3.5)(-turbo)?)$', NULL, 0.003, 0.006, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000608l52a2kh2jv', NULL, 'gpt-3.5-turbo-0613', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cb000708l5bx0q5uru', NULL, 'gpt-3.5-turbo-16k-0613', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),
  ('clrkwk4cc000808l51xmk4uic', NULL, 'gpt-3.5-turbo-0301', '(?i)^(gpt-4-32k)$', NULL, 0.06, 0.12, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1 }'),