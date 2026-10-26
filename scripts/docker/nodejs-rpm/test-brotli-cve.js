// TEMPORARY(CVE-2026-111497): see build.sh.
//
// Fails unless Node's bundled Brotli has the CVE-2026-111497 fix. The input and
// expected error come from Node v24.22.1 test/parallel/test-zlib-invalid-input.js:
// a block switch in a stream that declares a single block type. A fixed decoder
// reports BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH (errno -17); a vulnerable one
// fails later with a different error (Red Hat's 24.21.0 reports
// ERR__ERROR_FORMAT_BLOCK_LENGTH_1), so checking only that it throws would pass
// on a vulnerable build. The Brotli version string cannot tell either: Node did
// not bump it for the fix.
"use strict";
const zlib = require("node:zlib");

const input = Buffer.from(
  "200010414141fcffff07002228f00b60f7f41f000000",
  "hex",
);
const isFixError = (e) =>
  e?.code === "ERR__ERROR_FORMAT_BLOCK_SWITCH" && e?.errno === -17;
const describe = (e) => (e ? `${e.code} (errno ${e.errno})` : "no error");

let syncError = null;
try {
  zlib.brotliDecompressSync(input);
} catch (e) {
  syncError = e;
}

const decoder = zlib.createBrotliDecompress();
const streamResult = new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ outcome: "timeout" }), 5000);
  decoder.on("data", () => {});
  decoder.on("error", (e) => {
    clearTimeout(timer);
    resolve({ outcome: "error", error: e });
  });
  decoder.on("end", () => {
    clearTimeout(timer);
    resolve({ outcome: "end" });
  });
});
for (let i = 0; i < input.length; i++) decoder.write(input.subarray(i, i + 1));
decoder.end();

streamResult.then(({ outcome, error }) => {
  const fixed = isFixError(syncError) && isFixError(error);
  console.log(
    `Brotli CVE-2026-111497 (node ${process.version}): sync ${describe(syncError)}, ` +
      `stream ${outcome === "error" ? describe(error) : outcome} -> ${fixed ? "fixed" : "VULNERABLE"}`,
  );
  process.exit(fixed ? 0 : 1);
});
