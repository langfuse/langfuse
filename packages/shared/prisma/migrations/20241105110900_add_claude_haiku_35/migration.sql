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
  ('cm34aq60d000207ml0j1h31ar', NULL, 'claude-3-5-haiku-20241022', '(?i)^(claude-3-5-haiku-20241022|anthropic\.claude-3-5-haiku-20241022-v1:0|claude-3-5-haiku-V1@20241022)$', NULL, 0.000001, 0.000005, NULL, 'TOKENS', 'claude', NULL),
  ('cm34aqb9h000307ml6nypd618', NULL, 'claude-3.5-haiku-latest', '(?i)^(claude-3-5-haiku-latest)$', NULL, 0.000001, 0.000005, NULL, 'TOKENS', 'claude', NULL);

INSERT INTO prices (
  id, 
  model_id, 
  usage_type,
  price
)
VALUES
  ('cm34ax6mc000008jkfqed92mb', 'cm34aq60d000207ml0j1h31ar', 'input', 0.000001),
  ('cm34axb2o000108jk09wn9b47', 'cm34aqb9h000307ml6nypd618', 'input', 0.000001),
  ('cm34axeie000208jk8b2ke2t8', 'cm34aq60d000207ml0j1h31ar', 'output', 0.000005),
  ('cm34axi67000308jk7x1a7qko', 'cm34aqb9h000307ml6nypd618', 'output', 0.000005);
