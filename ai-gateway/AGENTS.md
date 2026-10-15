# Agent Guidelines for `ai-gateway`

## Method naming

- Getters stay nouns or `is_` / `has_`: `id()`, `attribution()`, `is_ready()`.
- Constructors use `new`, `from_*`, `with_*`, or `for_*`.
- Command methods that mutate, parse, extract, or drive a lifecycle use a
  verb-object name: `record_response`, `push_bytes`, `capture_request`,
  `apply_baggage`, `parse_claude_code`.
- Do not name a mutating method after the payload it consumes (`response`,
  `bytes`, `event`, `item`).

## Dependencies

- `deny.toml` configures `cargo deny check`: RustSec advisories, a permissive
  license allow-list, banned crates, and crates.io as the only source. Run it
  with `pnpm run rust:deny` after changing `Cargo.toml` or `Cargo.lock`.
- Fix an advisory by updating the crate (`cargo update -p <crate>`). Add an
  `[advisories].ignore` entry with a `reason` only when it does not apply.
- Do not add a license to the allow-list without a human decision; copyleft
  licenses need review because the gateway ships as a binary.
- `cargo machete` (`pnpm run rust:unused-deps`) fails CI on unused
  dependencies. Remove the dependency rather than ignoring it, unless it is
  only used through a macro the tool cannot see.
