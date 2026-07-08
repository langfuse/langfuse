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
  ('clqqpdjya000108lf3s4b4c4m','gpt-3.5-turbo-instruct', 'PER_1000_TOKENS', 0.002, 'USD', 'COMPLETION'),
  ('clnnuiuq6000008l4dxp43wc6', 'claude-instant-1.2', 'PER_1000_TOKENS', 0.00163, 'USD', 'PROMPT'),
  ('clnnujlmj000108l48wne4ii9', 'claude-instant-1.2', 'PER_1000_TOKENS', 0.00551, 'USD', 'COMPLETION'),
  ('clnnukutg000208l49qqt9lyr', 'claude-instant-1.1', 'PER_1000_TOKENS', 0.00163, 'USD', 'PROMPT'),
  ('clnnun3x3000408l490qz9uv0', 'claude-instant-1.1', 'PER_1000_TOKENS', 0.00551, 'USD', 'COMPLETION'),
  ('clnnuosvy000508l4gsjy2pp4', 'claude-2.0', 'PER_1000_TOKENS', 0.01102, 'USD', 'PROMPT'),
  ('clnnuqcns000608l40qaz8trt', 'claude-2.0', 'PER_1000_TOKENS', 0.03268, 'USD', 'COMPLETION'),
  ('clnnuuif8000808l4gal4fjq4', 'claude-1.0', 'PER_1000_TOKENS', 0.01102, 'USD', 'PROMPT'),
  ('clnnutptp000708l47r091vvd', 'claude-1.0', 'PER_1000_TOKENS', 0.03268, 'USD', 'COMPLETION'),
  ('clnon8riv000308mlgfr1agiv', 'text-embedding-ada-002', 'PER_1000_TOKENS', 0.0001, 'USD', 'PROMPT'),
  ('clnon9kfz000408ml1bg81o6z', 'text-embedding-ada-002', 'PER_1000_TOKENS', 0.0001, 'USD', 'COMPLETION'),
  ('clqwniv8a000d08l2frjl7mmw', 'codechat-bison-32k', 'PER_1000_CHARS', 0.0005, 'USD', 'PROMPT'),
  ('clqwnj044000e08l2dfjm5g90', 'chat-bison-32k', 'PER_1000_CHARS', 0.0005, 'USD', 'PROMPT'),
  ('clqwnj47r000f08l2a16fekls', 'chat-bison-32k', 'PER_1000_CHARS', 0.0005, 'USD', 'COMPLETION'),
  ('clqwnj863000g08l2bwxgdapm', 'codechat-bison-32k', 'PER_1000_CHARS', 0.0005, 'USD', 'COMPLETION')
ON CONFLICT (id) DO NOTHING;