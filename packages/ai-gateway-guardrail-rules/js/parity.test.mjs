// The committed wasm32 module must report the same compiled sizes as the
// native build (src/lib.rs `compiled_sizes_match_the_shared_fixture`), so the
// control plane and the gateway measure identical sizes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { validate } = require("../pkg/ai_gateway_guardrail_rules.js");
const fixture = JSON.parse(
  readFileSync(new URL("../tests/compiled-sizes.json", import.meta.url)),
);
const RFC_LIMITS = {
  max_pattern_chars: 500,
  max_rule_bytes: 128 * 1024,
  max_set_bytes: 512 * 1024,
};
const check = (patterns, limits = RFC_LIMITS) =>
  JSON.parse(validate(JSON.stringify({ patterns, limits })));

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

test("wasm32 enforces caller-supplied limits and requires them", () => {
  const ssn = String.raw`\b\d{3}-\d{2}-\d{4}\b`;
  assert.equal(check([ssn]).ok, true);
  assert.equal(check([ssn], { ...RFC_LIMITS, max_rule_bytes: 200 }).ok, false);
  assert.equal(check([ssn], { ...RFC_LIMITS, max_set_bytes: 200 }).ok, false);
  assert.equal(
    check([ssn], { ...RFC_LIMITS, max_pattern_chars: 10 }).ok,
    false,
  );

  const missingLimits = JSON.parse(
    validate(JSON.stringify({ patterns: [ssn] })),
  );
  assert.equal(missingLimits.ok, false);
  assert.match(missingLimits.set_error, /invalid input/);
});
