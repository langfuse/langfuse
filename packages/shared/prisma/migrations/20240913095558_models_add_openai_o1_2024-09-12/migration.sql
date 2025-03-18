-- For OpenAI reasoning models, manually tokenizing output string does not account for reasoning tokens, thus would lead to incorrect cost
-- So no manual tokenizer config is provided
-- Reference: https://platform.openai.com/docs/guides/reasoning/how-reasoning-works

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
  -- o1-preview
  ('cm10ivcdp0000gix7lelmbw80', NULL, 'o1-preview', '(?i)^(o1-preview)$', NULL, 0.000015, 0.00006, NULL, 'TOKENS', NULL, NULL), 

  -- o1-preview-2024-09-12
  ('cm10ivo130000n8x7qopcjjcg', NULL, 'o1-preview-2024-09-12', '(?i)^(o1-preview-2024-09-12)$', NULL, 0.000015, 0.00006, NULL, 'TOKENS', NULL, NULL), 

  -- o1-mini
  ('cm10ivwo40000r1x7gg3syjq0', NULL, 'o1-mini', '(?i)^(o1-mini)$', NULL, 0.000003, 0.000012, NULL, 'TOKENS', NULL, NULL), 

  -- o1-mini-2024-09-12
  ('cm10iw6p20000wgx7it1hlb22', NULL, 'o1-mini-2024-09-12', '(?i)^(o1-mini-2024-09-12)$', NULL, 0.000003, 0.000012, NULL, 'TOKENS', NULL, NULL) 

