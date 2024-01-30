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
  -- https://openai.com/blog/gpt-3-5-turbo-fine-tuning-and-api-updates
  -- ft model tokens are getting counted like the base model https://github.com/openai/tiktoken/blob/db5bda9fc93b3171db6c4afea329394e6b6d31ca/tiktoken/model.py
  
  ('cls08r8sq000308jq14ae96f0', NULL, 'ft:gpt-3.5-turbo-1106', '(?i)^(ft:)(gpt-3.5-turbo-1106:)([\w-]+)(:)([\w-]*)(:)([\w-]+)$', NULL, 0.000003, 0.000006, NULL, 'TOKENS', 'openai', '{"tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-1106", "tokensPerMessage": 3}'),
  ('cls08rp99000408jqepxoakjv', NULL, 'ft:gpt-3.5-turbo-0613', '(?i)^(ft:)(gpt-3.5-turbo-0613:)([\w-]+)(:)([\w-]*)(:)([\w-]+)$', NULL, 0.000012, 0.000016, NULL, 'TOKENS', 'openai', '{"tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-0613", "tokensPerMessage": 3}'),
  ('cls08rv9g000508jq5p4z4nlr', NULL, 'ft:davinci-002', '(?i)^(ft:)(davinci-002:)([\w-]+)(:)([\w-]*)(:)([\w-]+)$', NULL, 0.000012, 0.000012, NULL, 'TOKENS', 'openai', '{"tokenizerModel": "davinci-002"}'),
  ('cls08s2bw000608jq57wj4un2', NULL, 'ft:babbage-002', '(?i)^(ft:)(babbage-002:)([\w-]+)(:)([\w-]*)(:)([\w-]+)$', NULL, 0.0000016, 0.0000016, NULL, 'TOKENS', 'openai', '{"tokenizerModel": "babbage-002"}')
