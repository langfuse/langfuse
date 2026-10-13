# Agent Guidelines for `ai-gateway`

## Method naming

- Getters stay nouns or `is_` / `has_`: `id()`, `attribution()`, `is_ready()`.
- Constructors use `new`, `from_*`, `with_*`, or `for_*`.
- Command methods that mutate, parse, extract, or drive a lifecycle use a
  verb-object name: `record_response`, `push_bytes`, `capture_request`,
  `apply_baggage`, `parse_claude_code`.
- Do not name a mutating method after the payload it consumes (`response`,
  `bytes`, `event`, `item`).
