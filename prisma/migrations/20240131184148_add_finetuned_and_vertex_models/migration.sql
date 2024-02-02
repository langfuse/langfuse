DELETE FROM models
WHERE id in ('clrp1wopz000808l09nwy32xh', 'clrp1wopz000408l05xcycki1');

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
  
  ('cls08r8sq000308jq14ae96f0', NULL, 'ft:gpt-3.5-turbo-1106', '(?i)^(ft:)(gpt-3.5-turbo-1106:)(.+)(:)(.*)(:)(.+)$', NULL, 0.000003, 0.000006, NULL, 'TOKENS', 'openai', '{"tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-1106", "tokensPerMessage": 3}'),
  ('cls08rp99000408jqepxoakjv', NULL, 'ft:gpt-3.5-turbo-0613', '(?i)^(ft:)(gpt-3.5-turbo-0613:)(.+)(:)(.*)(:)(.+)$', NULL, 0.000012, 0.000016, NULL, 'TOKENS', 'openai', '{"tokensPerName": 1, "tokenizerModel": "gpt-3.5-turbo-0613", "tokensPerMessage": 3}'),
  ('cls08rv9g000508jq5p4z4nlr', NULL, 'ft:davinci-002', '(?i)^(ft:)(davinci-002:)(.+)(:)(.*)(:)(.+)$$', NULL, 0.000012, 0.000012, NULL, 'TOKENS', 'openai', '{"tokenizerModel": "davinci-002"}'),
  ('cls08s2bw000608jq57wj4un2', NULL, 'ft:babbage-002', '(?i)^(ft:)(babbage-002:)(.+)(:)(.*)(:)(.+)$$', NULL, 0.0000016, 0.0000016, NULL, 'TOKENS', 'openai', '{"tokenizerModel": "babbage-002"}'),

  -- https://cloud.google.com/vertex-ai/docs/generative-ai/pricing
  ('cls0k4lqt000008ky1o1s8wd5', NULL, 'gemini-pro', '(?i)^(gemini-pro)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0jni4t000008jk3kyy803r', NULL, 'chat-bison-32k', '(?i)^(chat-bison-32k)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0iv12d000108l251gf3038', NULL, 'chat-bison', '(?i)^(chat-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0jmjt3000108l83ix86w0d', NULL, 'text-bison-32k', '(?i)^(text-bison-32k)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0juygp000308jk2a6x9my2', NULL, 'text-bison', '(?i)^(text-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0jungb000208jk12gm4gk1', NULL, 'text-unicorn', '(?i)^(text-unicorn)(@[a-zA-Z0-9]+)?$', NULL, 0.0000025, 0.0000075, NULL, 'CHARACTERS', NULL, NULL),
  ('cls1nyj5q000208l33ne901d8', NULL, 'textembedding-gecko', '(?i)^(textembedding-gecko)(@[a-zA-Z0-9]+)?$', NULL, NULL, NULL, 0.0000001, 'CHARACTERS', NULL, NULL),
  ('cls1nyyjp000308l31gxy1bih', NULL, 'textembedding-gecko-multilingual', '(?i)^(textembedding-gecko-multilingual)(@[a-zA-Z0-9]+)?$', NULL, NULL, NULL, 0.0000001, 'CHARACTERS', NULL, NULL),
  ('cls1nzjt3000508l3dnwad3g0', NULL, 'code-gecko', '(?i)^(code-gecko)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls1nzwx4000608l38va7e4tv', NULL, 'code-bison', '(?i)^(code-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls1o053j000708l39f8g4bgs', NULL, 'code-bison-32k', '(?i)^(code-bison-32k)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0j33v1000008joagkc4lql', NULL, 'codechat-bison-32k', '(?i)^(codechat-bison-32k)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0jmc9v000008l8ee6r3gsd', NULL, 'codechat-bison', '(?i)^(codechat-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL)