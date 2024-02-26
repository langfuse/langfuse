-- Migration to add gpt-35 spelling

INSERT INTO pricings (
  id,
  model_name, 
  pricing_unit, 
  price,
  currency,
  token_type
)
VALUES
  ('clqqpc2pr000008l3hvy63gxy1','gpt-35-turbo-1106', 'PER_1000_TOKENS', 0.001, 'USD', 'PROMPT'),
  ('clqqpcb6d000208l3atrfbmou1','gpt-35-turbo-1106', 'PER_1000_TOKENS', 0.002, 'USD', 'COMPLETION'),
  ('clqqpdh45000008lfgrnx76cv1','gpt-35-turbo-instruct', 'PER_1000_TOKENS', 0.0015, 'USD', 'PROMPT'),
  ('clqqpdjya000108lf3s4b4c4m1','gpt-35-turbo-instruct', 'PER_1000_TOKENS', 0.002, 'USD', 'COMPLETION')
ON CONFLICT (id) DO NOTHING;