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
  -- https://ai.google.dev/models/gemini#model-variations
  -- https://cloud.google.com/vertex-ai/generative-ai/pricing
  ('cluv2sjeo000008ih0fv23hi0', NULL, 'gemini-1.0-pro-latest', '(?i)^(gemini-1.0-pro-latest)(@[a-zA-Z0-9]+)?$', NULL, 0.00000025, 0.0000005, NULL, 'CHARACTERS', NULL, NULL),
  -- stable versions priced differently
  -- https://developers.googleblog.com/2024/02/gemini-15-available-for-private-preview-in-google-ai-studio.html
  ('cluv2subq000108ih2mlrga6a', NULL, 'gemini-1.0-pro', '(?i)^(gemini-1.0-pro)(@[a-zA-Z0-9]+)?$', '2024-02-15', 0.000000125, 0.000000375, NULL, 'CHARACTERS', NULL, NULL),
  ('cluv2sx04000208ihbek75lsz', NULL, 'gemini-1.0-pro-001', '(?i)^(gemini-1.0-pro-001)(@[a-zA-Z0-9]+)?$', '2024-02-15', 0.000000125, 0.000000375, NULL, 'CHARACTERS', NULL, NULL),
  ('cluv2szw0000308ihch3n79x7', NULL, 'gemini-pro', '(?i)^(gemini-pro)(@[a-zA-Z0-9]+)?$', '2024-02-15', 0.000000125, 0.000000375, NULL, 'CHARACTERS', NULL, NULL),

  ('cluv2t2x0000408ihfytl45l1', NULL, 'gemini-1.5-pro-latest', '(?i)^(gemini-1.5-pro-latest)(@[a-zA-Z0-9]+)?$', NULL, 0.0000025, 0.0000075, NULL, 'CHARACTERS', NULL, NULL),

  -- https://platform.openai.com/docs/models/continuous-model-upgrades
  ('cluv2t5k3000508ih5kve9zag', NULL, 'gpt-4-turbo-2024-04-09', '(?i)^(gpt-4-turbo-2024-04-09)$', NULL, 0.00001, 0.00003, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4-1106-preview" }')


  