DELETE FROM models WHERE id = 'cluv2t5k3000508ih5kve9zag';
DELETE FROM models WHERE id = 'clrkvq6iq000008ju6c16gynt';

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
  -- updating tokenizer model to gpt-4-turbo-2024-04-09
  ('cluv2t5k3000508ih5kve9zag', NULL, 'gpt-4-turbo-2024-04-09', '(?i)^(gpt-4-turbo-2024-04-09)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-turbo-2024-04-09" }'),
  
  -- update gpt-4-1106-preview naming replacing gpt-4-turbo
  ('clrkvq6iq000008ju6c16gynt', NULL, 'gpt-4-1106-preview', '(?i)^(gpt-4-1106-preview)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-1106-preview" }'),
  
  -- apparently azure supports gpt-4-preview
  ('clv2o2x0p000008jsf9afceau', NULL, ' gpt-4-preview', '(?i)^(gpt-4-preview)$',  NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-turbo-preview" }')
  