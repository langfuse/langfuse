// TEMPORARY(node-24.22.1-security): see build.sh.
//
// Fails unless the installed Node has every fix that build.sh patches in. Each
// check calls the affected API directly and needs no network or certificates.
//
// - CVE-2026-111497 (Brotli): the input and expected error come from Node
//   v24.22.1 test/parallel/test-zlib-invalid-input.js: a block switch in a
//   stream that declares a single block type. A fixed decoder reports
//   BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH (errno -17); a vulnerable one
//   fails later with a different error (Red Hat's 24.21.0 reports
//   ERR__ERROR_FORMAT_BLOCK_LENGTH_1), so checking only that it throws would
//   pass on a vulnerable build. The Brotli version string cannot tell either:
//   Node did not bump it for the fix.
// - CVE-2026-106069 and CVE-2026-105483 (TLS): checkServerIdentity() must
//   reject hosts that are IP addresses only after IDNA normalization, such as
//   '0127.0.0.1' (octal, normalizes to 87.0.0.1) or fullwidth digits, instead
//   of matching them against DNS names. Canonical IPv4 and IPv6 hosts must
//   still match their IP SANs.
// - CVE-2026-105482 (DNS): resolver methods must reject names containing null
//   bytes instead of truncating them at the first one.
"use strict";
const dns = require("node:dns");
const tls = require("node:tls");
const zlib = require("node:zlib");

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });
const describe = (e) => (e ? `${e.code} (errno ${e.errno})` : "no error");

function checkTls() {
  const nonCanonical = [
    ["0127.0.0.1", "DNS:87.0.0.1"],
    ["127.1", "DNS:127.0.0.1"],
    ["１２７.0.0.1", "DNS:127.0.0.1"],
    ["127。0.0.1", "DNS:127.0.0.1"],
  ];
  for (const [host, san] of nonCanonical) {
    const result = tls.checkServerIdentity(host, {
      subjectaltname: san,
      subject: {},
    });
    check(
      `tls rejects ${JSON.stringify(host)} against ${san}`,
      result?.code === "ERR_TLS_CERT_ALTNAME_INVALID" &&
        result.reason === "Host is a non-canonical IP address",
      result ? `${result.code}: ${result.reason}` : "accepted",
    );
  }
  const canonical = [
    ["127.0.0.1", "IP Address:127.0.0.1"],
    ["::1", "IP Address:0:0:0:0:0:0:0:1"],
  ];
  for (const [host, san] of canonical) {
    const result = tls.checkServerIdentity(host, {
      subjectaltname: san,
      subject: {},
    });
    check(
      `tls accepts ${host} against ${san}`,
      result === undefined,
      result ? `${result.code}: ${result.reason}` : "accepted",
    );
  }
}

async function checkDns() {
  // A vulnerable build sends the truncated query, so point it at a closed
  // local port and cancel it rather than wait on real DNS.
  const name = "example.com\u0000.trusted.corp";
  const isFixError = (e) => e?.code === "ERR_INVALID_ARG_VALUE";

  const resolver = new dns.Resolver({ timeout: 100, tries: 1 });
  resolver.setServers(["127.0.0.1:9"]);
  let callbackError = null;
  try {
    resolver.resolve4(name, () => {});
  } catch (e) {
    callbackError = e;
  }
  resolver.cancel();
  check(
    "dns.Resolver#resolve4 rejects null bytes",
    isFixError(callbackError),
    callbackError?.code ?? "query sent",
  );

  const promiseResolver = new dns.promises.Resolver({ timeout: 100, tries: 1 });
  promiseResolver.setServers(["127.0.0.1:9"]);
  let promiseError = null;
  try {
    promiseResolver.resolve4(name).catch(() => {});
  } catch (e) {
    promiseError = e;
  }
  promiseResolver.cancel();
  check(
    "dns.promises.Resolver#resolve4 rejects null bytes",
    isFixError(promiseError),
    promiseError?.code ?? "query sent",
  );
}

async function checkBrotli() {
  const input = Buffer.from(
    "200010414141fcffff07002228f00b60f7f41f000000",
    "hex",
  );
  const isFixError = (e) =>
    e?.code === "ERR__ERROR_FORMAT_BLOCK_SWITCH" && e?.errno === -17;

  let syncError = null;
  try {
    zlib.brotliDecompressSync(input);
  } catch (e) {
    syncError = e;
  }
  check("brotli sync", isFixError(syncError), describe(syncError));

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
  for (let i = 0; i < input.length; i++)
    decoder.write(input.subarray(i, i + 1));
  decoder.end();
  const { outcome, error } = await streamResult;
  check(
    "brotli stream",
    isFixError(error),
    outcome === "error" ? describe(error) : outcome,
  );
}

(async () => {
  checkTls();
  await checkDns();
  await checkBrotli();
  for (const { name, ok, detail } of results) {
    console.log(`${ok ? "fixed     " : "VULNERABLE"} ${name}: ${detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `Node ${process.version} security fixes: ${results.length - failed}/${results.length} checks pass`,
  );
  process.exit(failed ? 1 : 0);
})();
