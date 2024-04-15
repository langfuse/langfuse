DELETE FROM models WHERE id = 'clrkvq6iq000008ju6c16gynt';
DELETE FROM models WHERE id = 'cluv2t5k3000508ih5kve9zag';


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
  -- update gpt-4-1106-preview to gpt-4-1106-preview also in the naming
  ('clrkvq6iq000008ju6c16gynt', NULL, 'gpt-4-1106-preview', '(?i)^(gpt-4-1106-preview)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-1106-preview" }'),
  -- updating tokenizer model to gpt-4-turbo-2024-04-09
  ('cluv2t5k3000508ih5kve9zag', NULL, 'gpt-4-turbo-2024-04-09', '(?i)^(gpt-4-turbo-2024-04-09)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-turbo-2024-04-09" }'),
  
  
  -- add new model name gpt-4-turbo-preview pointing to gpt-4-0125-preview
  ('clv12vkly000008jre4cohbx1', NULL, 'gpt-4-turbo-preview', '(?i)^(gpt-4-turbo-preview)$',  NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-turbo-preview" }'),
  -- add new model name gpt-4-turbo currentlu pointing to gpt-4-turbo-2024-04-09
  ('clrkvq6iq000008ju6c16gynt', NULL, 'gpt-4-turbo', '(?i)^(gpt-4-turbo)$',  NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-turbo" }')
  