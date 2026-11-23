// Calls the WebAssembly validator the way the control plane would on save.
// Usage: node js/demo.mjs (uses the committed pkg/; rebuild with scripts/build-wasm.sh)
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { limits, validate } = require("../pkg/guardrail_rules.js");

const check = (patterns) => {
  const started = performance.now();
  const report = JSON.parse(validate(JSON.stringify({ patterns })));
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
  "over the per-rule size limit": [String.raw`\w{1,500}`.repeat(5)],
  "too many rules": Array.from({ length: 51 }, (_, i) => `word${i}`),
};

console.log("limits".padEnd(32), limits());
for (const [name, patterns] of Object.entries(cases)) {
  console.log(name.padEnd(32), JSON.stringify(check(patterns)));
}
