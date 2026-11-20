// Calls the WebAssembly validator the way the control plane would on save.
// Usage: bash scripts/build-wasm.sh && node js/demo.mjs
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validate } = require(
  `${process.env.OUT ?? "/tmp/guardrail-rules-pkg"}/guardrail_rules.js`,
);

const check = (patterns, limits) => {
  const started = performance.now();
  const report = JSON.parse(validate(JSON.stringify({ patterns, limits })));
  return { ms: +(performance.now() - started).toFixed(2), ...report };
};

const cases = {
  "valid PII rules": [
    String.raw`\b\d{3}-\d{2}-\d{4}\b`,
    String.raw`(?i)\bbearer\s+[A-Za-z0-9._~+/-]{20,}`,
    String.raw`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`,
  ],
  "unicode class": [String.raw`\p{L}+`],
  "inline u flag": [String.raw`(?u:\w)+`],
  lookahead: [String.raw`foo(?=bar)`],
  backreference: [String.raw`(a)\1`],
  "syntax error": [String.raw`(unclosed`],
  "too big for a 16 KiB rule limit": [String.raw`[a-z]{1,1000}x`],
};

for (const [name, patterns] of Object.entries(cases)) {
  const limits = name.startsWith("too big")
    ? { max_rule_bytes: 16 * 1024 }
    : undefined;
  console.log(name.padEnd(32), JSON.stringify(check(patterns, limits)));
}
console.log(
  "too many rules".padEnd(32),
  JSON.stringify(check(["a", "b", "c"], { max_rules: 2 })),
);
