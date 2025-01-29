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
  tokenizer_id
)
VALUES
  -- add 3.5 sonnet model
  ('clxt0n0m60000pumz1j5b7zsf', NULL, 'claude-3-5-sonnet-20240620', '(?i)^(claude-3-5-sonnet(-|@)?20240620)$', NULL, 0.000003, 0.000015, NULL, 'TOKENS', 'claude')