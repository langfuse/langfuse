-- This is an empty migration.

DELETE FROM models
WHERE id in (
  'clrnwbota000908jsgg9mb1ml',
  'clrnwb41q000308jsfrac9uh6', 
  'clrnwbd1m000508js4hxu6o7n', 
  'clrnwb836000408jsallr6u11', 
  'clrnwbg2b000608jse2pp4q2d', 
  'clrnwbi9d000708jseiy44k26',
  'clrnwblo0000808jsc1385hdp'
);



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
  -- nothing earlier required for ada
  ('clrnwbota000908jsgg9mb1ml', NULL, 'claude-instant-1', '(?i)^(claude-instant-1)$', NULL, 0.00000163, 0.00000551, NULL, 'TOKENS', 'claude', NULL),
  ('clrnwb41q000308jsfrac9uh6', NULL, 'claude-instant-1.2', '(?i)^(claude-instant-1.2)$', NULL, 0.00000163, 0.00000551, NULL, 'TOKENS', 'claude', NULL),
  ('clrnwbd1m000508js4hxu6o7n', NULL, 'claude-2.1', '(?i)^(claude-2.1)$', NULL, 0.000008, 0.000024, NULL, 'TOKENS', 'claude', NULL),
  ('clrnwb836000408jsallr6u11', NULL, 'claude-2.0', '(?i)^(claude-2.0)$', NULL, 0.000008, 0.000024, NULL, 'TOKENS', 'claude', NULL),
  ('clrnwbg2b000608jse2pp4q2d', NULL, 'claude-1.3', '(?i)^(claude-1.3)$', NULL, 0.000008, 0.000024, NULL, 'TOKENS', 'claude', NULL),
  ('clrnwbi9d000708jseiy44k26', NULL, 'claude-1.2', '(?i)^(claude-1.2)$', NULL, 0.000008, 0.000024, NULL, 'TOKENS', 'claude', NULL),
  ('clrnwblo0000808jsc1385hdp', NULL, 'claude-1.1', '(?i)^(claude-1.1)$', NULL, 0.000008, 0.000024, NULL, 'TOKENS', 'claude', NULL)



