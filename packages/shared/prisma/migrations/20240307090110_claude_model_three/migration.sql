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
  ('cltgy0iuw000008le3vod1hhy', NULL, 'claude-3-opus-20240229', '(?i)^(claude-3-opus-20240229)$', NULL, 0.000015, 0.000075, NULL, 'TOKENS', 'claude', NULL),
  ('cltgy0pp6000108le56se7bl3', NULL, 'claude-3-sonnet-20240229', '(?i)^(claude-3-sonnet-20240229)$', NULL, 0.000003, 0.000015, NULL, 'TOKENS', 'claude', NULL)

