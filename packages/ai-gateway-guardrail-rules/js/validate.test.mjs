// Exercises the committed Node/WebAssembly bindings produced by scripts/build-wasm.sh.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { preview, validate } = require("../pkg/ai_gateway_guardrail_rules.js");

const RULE_LIMIT_BYTES = 128 * 1024;
const ORG_LIMIT_BYTES = 512 * 1024;

test("wasm32 accepts valid ASCII and UTF-8-safe rules and rejects invalid ones with typed codes", () => {
  const valid = validate(
    [
      String.raw`\b\d{3}-\d{2}-\d{4}\b`,
      String.raw`(?i)\bbearer\s+[A-Za-z0-9._~+/-]{20,}`,
      String.raw`token=\S+`,
      String.raw`password=.+`,
      String.raw`"[^"]+"`,
    ],
    RULE_LIMIT_BYTES,
  );
  assert.equal(valid.ok, true);
  assert.equal(valid.rules.length, 5);
  assert.ok(valid.set_bytes > 0);

  for (const [pattern, expectedCode] of [
    [String.raw`\p{L}+`, "unicode_not_allowed"],
    [String.raw`(?u:\w)+`, "unicode_not_allowed"],
    [String.raw`foo(?=bar)`, "unsupported_lookaround"],
    [String.raw`(a)\1`, "unsupported_backreference"],
    ["(unclosed", "syntax_error"],
    ["x?", "matches_empty_string"],
    ["", "empty_pattern"],
  ]) {
    const report = validate([pattern], RULE_LIMIT_BYTES);
    assert.equal(report.ok, false, pattern);
    assert.equal(report.rules[0].error?.code, expectedCode, pattern);
    assert.ok(report.rules[0].error?.message, pattern);
  }
});

test("wasm32 enforces caller-supplied combined max_bytes", () => {
  const ssn = String.raw`\b\d{3}-\d{2}-\d{4}\b`;
  const okReport = validate([ssn], ORG_LIMIT_BYTES);
  assert.equal(okReport.ok, true);
  const ssnBytes = okReport.set_bytes;
  assert.ok(ssnBytes > 0);

  const tooBig = validate([ssn], ssnBytes - 1);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.set_error?.code, "size_limit_exceeded");
});

test("wasm32 preview returns UTF-16 match spans and typed validation errors", () => {
  const text = "😀 ORD-123456 and ORD-999999";
  const result = preview(String.raw`ORD-\d{6}`, text, RULE_LIMIT_BYTES);
  assert.equal(result.valid, true);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.matches.map(({ start, end }) => text.slice(start, end)),
    ["ORD-123456", "ORD-999999"],
  );

  const invalid = preview(String.raw`(?u:\w)+`, text, RULE_LIMIT_BYTES);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.truncated, false);
  assert.equal(invalid.error?.code, "unicode_not_allowed");
  assert.ok(invalid.error?.message);
  assert.deepEqual(invalid.matches, []);

  const alt = preview("key|api_key", "prefix api_key suffix", RULE_LIMIT_BYTES);
  assert.equal(alt.valid, true);
  assert.equal(alt.truncated, false);
  assert.deepEqual(
    alt.matches.map(({ start, end }) =>
      "prefix api_key suffix".slice(start, end),
    ),
    ["api_key"],
  );

  const lazy = preview("x+?y", "xxxy", RULE_LIMIT_BYTES);
  assert.equal(lazy.valid, true);
  assert.equal(lazy.truncated, false);
  assert.deepEqual(
    lazy.matches.map(({ start, end }) => "xxxy".slice(start, end)),
    ["xxxy"],
  );

  const adversarial =
    Array.from({ length: 80 }, (_, i) => `.+X${i}`).join("|") + "|.";
  const bounded = preview(adversarial, "é".repeat(4000), RULE_LIMIT_BYTES);
  assert.equal(bounded.valid, true);
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.matches.length > 0);
});
