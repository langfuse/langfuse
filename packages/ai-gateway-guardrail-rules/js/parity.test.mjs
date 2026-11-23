// The committed wasm32 module must report the same compiled sizes as the
// native build (src/lib.rs `compiled_sizes_match_the_shared_fixture`), so the
// control plane and the gateway enforce the limits on identical numbers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { validate } = require("../pkg/ai_gateway_guardrail_rules.js");
const fixture = JSON.parse(
  readFileSync(new URL("../tests/compiled-sizes.json", import.meta.url)),
);
const check = (patterns) => JSON.parse(validate(JSON.stringify({ patterns })));

test("wasm32 reports the shared fixture's compiled sizes", () => {
  for (const { pattern, compiled_bytes } of fixture.rules) {
    assert.equal(
      check([pattern]).rules[0].compiled_bytes ?? null,
      compiled_bytes,
      pattern,
    );
  }
  const valid = fixture.rules
    .filter(({ compiled_bytes }) => compiled_bytes !== null)
    .map(({ pattern }) => pattern);
  assert.equal(check(valid).set_bytes, fixture.set_bytes);
});
