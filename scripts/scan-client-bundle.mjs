#!/usr/bin/env node
/**
 * Post-build client-bundle scanner (LFE-10645).
 *
 * Parses every emitted client chunk and reports identifiers that are
 * REFERENCED but DECLARED NOWHERE in the chunk and are not known runtime
 * globals. A minifier that deletes a binding while keeping a reference to it
 * (the SWC dropped-binding class that caused LFE-10640, a production-only
 * `ReferenceError` on opening a trace peek) always leaves exactly such a free
 * identifier behind — and since the minifier owns every name it emits, a
 * non-global free identifier in minified output is a miscompilation until
 * proven otherwise.
 *
 * This check is complete for the dropped-binding class (a deleted binding
 * necessarily produces an undeclared reference, and scope analysis finds all
 * of them), covers vendored dependency code that no source-level lint can
 * see, and needs no server, browser, or database. It cannot see other
 * miscompilation classes (e.g. a fold to a wrong value) — those need runtime
 * exercise.
 *
 * Usage: node scripts/scan-client-bundle.mjs <chunks-dir>
 *   e.g. node scripts/scan-client-bundle.mjs web/.next/static/chunks
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = usage/parse failure.
 *
 * If this scanner fails your build: the named binding was deleted by the
 * minifier while code still reads it. The canonical first-party fix is to
 * move the module-level const into the (single) function that reads it — see
 * the LFE-10640 fix in TraceLayoutDesktop.tsx (#14735) — and to link the
 * upstream SWC issue in a comment so the workaround is deletable once fixed.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// espree and eslint-scope are CommonJS without ESM default-export interop.
const require = createRequire(import.meta.url);
const espree = require("espree");
const eslintScope = require("eslint-scope");
const globals = require("globals");

// Identifiers that legitimately appear free in minified chunks. Every entry
// must carry a reason — this list is a hole in the net, keep it short.
const AMBIENT_ALLOWLIST = new Map([
  // Bundler / framework runtime names registered by the runtime chunk or the
  // host page before any app chunk executes.
  ["__turbopack_context__", "Turbopack module runtime"],
  ["TURBOPACK", "Turbopack chunk registration global"],
  ["TURBOPACK_NEXT_CHUNK_URLS", "Turbopack chunk-URL manifest global"],
  ["__turbopack_load_page_chunks__", "Turbopack page-chunk loader"],
  ["webpackChunk_N_E", "Next.js webpack chunk registry (webpack-mode builds)"],
  ["__webpack_require__", "webpack module runtime"],
  ["__webpack_nonce__", "webpack CSP nonce hook, read if defined"],
  ["__nccwpck_require__", "ncc-precompiled vendored packages' runtime"],
  ["regeneratorRuntime", "legacy async/generator runtime, guarded usage"],
  ["define", "AMD loader probe in UMD wrappers"],
  // Devtools / observability hooks that exist only when their host injects
  // them; libraries read them behind existence checks the parser can't
  // always classify as typeof-guards.
  ["__REACT_DEVTOOLS_GLOBAL_HOOK__", "React DevTools hook"],
  ["__SENTRY_DEBUG__", "Sentry magic build flag"],
  ["__SENTRY_TRACING__", "Sentry magic build flag"],
  ["__SENTRY_BROWSER_BUNDLE__", "Sentry magic build flag"],
  ["__SENTRY_RELEASE__", "Sentry magic build flag"],
  ["__SENTRY_EXCLUDE_REPLAY_WORKER__", "Sentry replay build flag"],
  ["__RRWEB_EXCLUDE_IFRAME__", "rrweb (Sentry replay) build flag"],
  ["__RRWEB_EXCLUDE_SHADOW_DOM__", "rrweb (Sentry replay) build flag"],
  ["UUIDV7_DENY_WEAK_RNG", "uuidv7 opt-in strictness global"],
  // Cross-environment feature probes in vendored libraries (not all reads
  // are typeof-guarded; the guarded read establishes existence first).
  ["ActiveXObject", "legacy IE probe in vendored libs"],
  ["Bun", "Bun runtime probe"],
  ["Deno", "Deno runtime probe"],
  ["AsyncIterator", "ES proposal probe in vendored libs"],
  [
    "onProfilerEvent",
    "React scheduler profiling hook; call is typeof-guarded in-expression",
  ],
  [
    "toString",
    "bare toString.call idiom resolves to globalThis's inherited Object.prototype.toString — cannot throw",
  ],
]);

const KNOWN_GLOBALS = new Set([
  ...Object.keys(globals.browser),
  ...Object.keys(globals.worker),
  ...Object.keys(globals.builtin),
  // Server/SSR shims inside client chunks reference Node globals behind
  // environment checks.
  ...Object.keys(globals.node),
]);

function scanFile(file) {
  const code = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = espree.parse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      loc: true,
      range: true,
    });
  } catch {
    // Some chunks are emitted as ES modules — retry before giving up.
    ast = espree.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      loc: true,
      range: true,
    });
  }

  const scopeManager = eslintScope.analyze(ast, {
    ecmaVersion: 2024,
    sourceType: "script",
    ignoreEval: true,
  });

  // `typeof x` is legal for undeclared x (feature detection) — collect the
  // argument positions so those references are not reported.
  const typeofRanges = new Set();
  (function walk(node) {
    if (!node || typeof node.type !== "string") return;
    if (
      node.type === "UnaryExpression" &&
      node.operator === "typeof" &&
      node.argument.type === "Identifier"
    ) {
      typeofRanges.add(node.argument.range[0]);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === "string") walk(value);
    }
  })(ast);

  // globalScope.through = references no scope in this file resolves.
  const findings = new Map();
  for (const ref of scopeManager.globalScope.through) {
    const name = ref.identifier.name;
    if (KNOWN_GLOBALS.has(name)) continue;
    if (AMBIENT_ALLOWLIST.has(name)) continue;
    if (typeofRanges.has(ref.identifier.range[0])) continue;
    if (!findings.has(name)) findings.set(name, []);
    findings
      .get(name)
      .push(
        `${ref.identifier.loc.start.line}:${ref.identifier.loc.start.column}`,
      );
  }
  return findings;
}

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error(
    "usage: node scripts/scan-client-bundle.mjs <chunks-dir>\n" +
      `  chunks dir not found: ${dir ?? "(missing argument)"}`,
  );
  process.exit(2);
}

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join(dir, f));

const started = Date.now();
const byName = new Map();
let parseFailures = 0;
for (const file of files) {
  try {
    for (const [name, locs] of scanFile(file)) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ file: path.basename(file), locs });
    }
  } catch (error) {
    parseFailures += 1;
    console.error(`PARSE FAILED ${path.basename(file)}: ${error.message}`);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`scanned ${files.length} chunks in ${seconds}s`);

if (parseFailures > 0) {
  console.error(`\n${parseFailures} chunk(s) could not be parsed — failing.`);
  process.exit(2);
}

if (byName.size === 0) {
  console.log(
    "clean: every referenced identifier is declared or a known global",
  );
  process.exit(0);
}

console.error(
  `\n${byName.size} undeclared identifier(s) found — the minifier likely ` +
    "deleted a binding that live code still reads (LFE-10640 class).\n" +
    "Each of these throws ReferenceError if the referencing line executes:\n",
);
for (const [name, hits] of [...byName.entries()].sort(
  (a, b) => b[1].length - a[1].length,
)) {
  const chunks = hits.map((h) => h.file);
  console.error(
    `  ${name} — ${chunks.length} chunk(s): ${chunks.slice(0, 4).join(", ")}${
      chunks.length > 4 ? ", …" : ""
    }`,
  );
}
console.error(
  "\nFix: keep the value local to its single reader (see #14735 for the " +
    "canonical fix) or restructure the shape; for vendored dependency code, " +
    "change how the dependency is shipped. See LFE-10645 for the analysis.",
);
process.exit(1);
