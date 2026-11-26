# Agent Guidelines for `ai-gateway`

## Lints

- Lint policy lives in `Cargo.toml` (`[lints]`) and `clippy.toml`; verify with
  `pnpm --filter ai-gateway run lint`.
- Suppress a lint only with `#[expect(lint, reason = "...")]` on the narrowest
  item. `#[allow]` is denied.
- Production code must not panic: no `unwrap`, `expect`, `panic!`, `todo!`, or
  `print!`/`eprintln!`. Recover poisoned locks with
  `PoisonError::into_inner`; tests are exempt.
- Default to `pub(crate)` inside private modules; `unreachable_pub` warns.

## Method naming

- Getters stay nouns or `is_` / `has_`: `id()`, `attribution()`, `is_ready()`.
- Constructors use `new`, `from_*`, `with_*`, or `for_*`.
- Command methods that mutate, parse, extract, or drive a lifecycle use a
  verb-object name: `record_response`, `push_bytes`, `capture_request`,
  `apply_baggage`, `parse_claude_code`.
- Do not name a mutating method after the payload it consumes (`response`,
  `bytes`, `event`, `item`).
