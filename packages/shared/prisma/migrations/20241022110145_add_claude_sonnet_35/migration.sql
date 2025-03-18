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
  -- https://docs.anthropic.com/en/docs/about-claude/models#model-comparison-table
  ('cm2krz1uf000208jjg5653iud', NULL, 'claude-3.5-haiku-20241022', '(?i)^(claude-3-5-sonnet-20241022|anthropic\.claude-3-5-sonnet-20241022-v2:0|claude-3-5-sonnet-V2@20241022)$', NULL, 0.000003, 0.000015, NULL, 'TOKENS', 'claude', NULL),
  ('cm2ks2vzn000308jjh4ze1w7q', NULL, 'claude-3.5-haiku-latest', '(?i)^(claude-3-5-sonnet-latest)$', NULL, 0.000003, 0.000015, NULL, 'TOKENS', 'claude', NULL)

