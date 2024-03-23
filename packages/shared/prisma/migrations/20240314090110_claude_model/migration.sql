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
  -- https://docs.anthropic.com/claude/docs/models-overview, https://docs.anthropic.com/claude/docs/quickstart-guide
  ('cltr0w45b000008k1407o9qv1', NULL, 'claude-3-haiku-20240307', '(?i)^(claude-3-haiku-20240307)$', NULL, 0.00000025, 0.00000125, NULL, 'TOKENS', 'claude', NULL)

