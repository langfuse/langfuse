-- Migration to add gpt-3.5-turbo-1106 and gpt-3.5-turbo-instruct models

INSERT INTO pricings (
  id,
  model_name, 
  pricing_unit, 
  price,
  currency,
  token_type
)
VALUES
  ('clqqpc2pr000008l3hvy63gxy','gpt-3.5-turbo-1106', 'PER_1000_TOKENS', 0.001, 'USD', 'PROMPT'),
  ('clqqpcb6d000208l3atrfbmou','gpt-3.5-turbo-1106', 'PER_1000_TOKENS', 0.002, 'USD', 'COMPLETION'),
  ('clqqpdh45000008lfgrnx76cv','gpt-3.5-turbo-instruct', 'PER_1000_TOKENS', 0.0015, 'USD', 'PROMPT'),
  ('clqqpdjya000108lf3s4b4c4m','gpt-3.5-turbo-instruct', 'PER_1000_TOKENS', 0.002, 'USD', 'COMPLETION')