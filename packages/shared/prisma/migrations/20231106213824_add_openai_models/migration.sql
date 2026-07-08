-- This is an empty migration.

INSERT INTO pricings (
  id,
  model_name, 
  pricing_unit, 
  price,
  currency,
  token_type
)
VALUES
  ('clm0obv1u00003b6lc2etkzfu','gpt-4-1106-preview', 'PER_1000_TOKENS', 0.01, 'USD', 'PROMPT'),
  ('clm0obv1u00003b6lc2etkzfg','gpt-4-1106-preview', 'PER_1000_TOKENS', 0.03, 'USD', 'COMPLETION'),
  ('clm0obv1u00013b6l4gdl83vs','gpt-4-1106-vision-preview	', 'PER_1000_TOKENS', 0.01, 'USD', 'PROMPT'),
  ('clm0obv1u00013b6l4gjl83vs','gpt-4-1106-vision-preview	', 'PER_1000_TOKENS', 0.03, 'USD', 'COMPLETION')