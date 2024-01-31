DELETE FROM models
WHERE id in ('clrp1wopz000808l09nwy32xh', 'clrp1wopz000408l05xcycki1')


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
  -- https://cloud.google.com/vertex-ai/docs/generative-ai/pricing
  -- Tokens für measuring max length but pricing is in characters
  -- Currently missing Embeddings, CodeGeneration (+32k), Code Completion (https://cloud.google.com/vertex-ai/docs/generative-ai/learn/models) as noone has used them yet
  -- @version stands for stable versions: currently no information about @001 current pricing (for pricing back then best finds so far:
  -- https://medium.com/google-cloud/understanding-the-pricing-for-vertex-ai-text-bison-foundation-model-7a95fd454b2e and
  -- https://medium.com/@van.evanfebrianto/a-deep-dive-into-monitoring-character-consumption-in-langchain-for-vertexai-ensuring-business-d4b6363802a5)
  
  ('cls0j33v1000008joagkc4lql', NULL, 'codechat-bison-32k', '(?i)^(codechat-bison-32k)$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  ('cls0jmc9v000008l8ee6r3gsd', NULL, 'codechat-bison', '(?i)^(codechat-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL)
  ('cls0jni4t000008jk3kyy803r', NULL, 'chat-bison-32k', '(?i)^(chat-bison-32k)$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL)
  ('cls0iv12d000108l251gf3038', NULL, 'chat-bison', '(?i)^(chat-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL)
  ('cls0jmjt3000108l83ix86w0d', NULL, 'text-bison-32k', '(?i)^(text-bison-32k)$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL)
  ('cls0juygp000308jk2a6x9my2', NULL, 'text-bison', '(?i)^(text-bison)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL)  
  ('cls0jungb000208jk12gm4gk1', NULL, 'text-unicorn', '(?i)^(text-unicorn)(@[a-zA-Z0-9]+)?$', NULL, 0.0000025, 0.0000075, NULL, 'CHARACTERS', NULL, NULL) 
  ('cls0k4lqt000008ky1o1s8wd5', NULL, 'gemini-pro', '(?i)^(gemini-pro)$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL) 
