// Exercises the committed Node/WebAssembly bindings produced by scripts/build-wasm.sh.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { preview, validate } = require("../pkg/ai_gateway_guardrail_rules.js");

const RFC_LIMITS = {
  max_rule_bytes: 128 * 1024,
  max_set_bytes: 512 * 1024,
};

test("wasm32 accepts valid ASCII and UTF-8-safe rules and rejects invalid ones", () => {
  const valid = validate(
    [
      String.raw`\b\d{3}-\d{2}-\d{4}\b`,
      String.raw`(?i)\bbearer\s+[A-Za-z0-9._~+/-]{20,}`,
      String.raw`token=\S+`,
      String.raw`password=.+`,
      String.raw`"[^"]+"`,
    ],
    RFC_LIMITS,
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.rules.length, 5);
  assert.ok(valid.set_bytes > 0);

  for (const pattern of [
    String.raw`\p{L}+`,
    String.raw`(?u:\w)+`,
    String.raw`foo(?=bar)`,
    "x?",
    "",
  ]) {
    const report = validate([pattern], RFC_LIMITS);
    assert.equal(report.ok, false, pattern);
    assert.ok(report.rules[0].error, pattern);
  }
});

test("wasm32 enforces caller-supplied size limits and rejects missing limits", () => {
  const ssn = String.raw`\b\d{3}-\d{2}-\d{4}\b`;
  const okReport = validate([ssn], RFC_LIMITS);
  assert.equal(okReport.ok, true);
  const ssnBytes = okReport.rules[0].compiled_bytes;
  assert.ok(ssnBytes > 0);

  assert.equal(
    validate([ssn], { ...RFC_LIMITS, max_rule_bytes: ssnBytes - 1 }).ok,
    false,
  );
  assert.equal(
    validate([ssn], { ...RFC_LIMITS, max_set_bytes: ssnBytes - 1 }).ok,
    false,
  );
  assert.throws(() => validate([ssn], {}));
});

test("wasm32 preview returns UTF-16 match spans and validation errors", () => {
  const text = "😀 ORD-123456 and ORD-999999";
  const result = preview(
    String.raw`ORD-\d{6}`,
    text,
    RFC_LIMITS.max_rule_bytes,
  );
  assert.equal(result.valid, true);
  assert.deepEqual(
    result.matches.map(({ start, end }) => text.slice(start, end)),
    ["ORD-123456", "ORD-999999"],
  );

  const invalid = preview(
    String.raw`(?u:\w)+`,
    text,
    RFC_LIMITS.max_rule_bytes,
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.error);
  assert.deepEqual(invalid.matches, []);
});
