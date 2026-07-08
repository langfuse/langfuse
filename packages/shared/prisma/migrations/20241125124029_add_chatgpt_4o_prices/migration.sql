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
  ('cm3x0p8ev000008kyd96800c8', NULL, 'chatgpt-4o-latest', '(?i)^(chatgpt-4o-latest)$', NULL, 0.000005, 0.000015, NULL, 'TOKENS', 'openai', '{ "tokensPerMessage": 3, "tokensPerName": 1, "tokenizerModel": "gpt-4o" }');

INSERT INTO prices (
  id, 
  model_id, 
  usage_type,
  price
)
VALUES
  ('cm3x0psrz000108kydpxg9o2k', 'cm3x0p8ev000008kyd96800c8', 'input', 0.000005),
  ('cm3x0pyt7000208ky8737gdla', 'cm3x0p8ev000008kyd96800c8', 'output', 0.000015);
