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

- The repository-root `deny.toml`, shared with `packages/native`, configures
  `cargo deny check`: RustSec advisories, a permissive
  license allow-list, banned crates, and crates.io as the only source. Run it
  with `pnpm run rust:deny` after changing `Cargo.toml` or `Cargo.lock`.
  Install the CI versions of the tools once with
  `cargo install --locked cargo-deny@0.20.2 cargo-machete@0.9.2`.
  In CI, the required `tests-ai-gateway` job checks bans, licenses, and
  sources; `licencecheck.yml` repeats the license check next to the pnpm one.
  Advisories are not a CI check: Dependabot alerts cover them.
- Fix an advisory by updating the crate (`cargo update -p <crate>`). Add an
  `[advisories].ignore` entry with a `reason` only when it does not apply.
- The license allow-list follows the repo policy in
  `.github/workflows/licencecheck.yml`: no weak, strong, or network copyleft,
  because the gateway is open source and ships as a binary to self-hosters. Do
  not add a license to the allow-list without a human decision.
- `cargo machete` (`pnpm run rust:unused-deps`) fails CI on unused
  dependencies. Remove the dependency rather than ignoring it, unless it is
  only used through a macro the tool cannot see.
