#!/usr/bin/env node
/**
 * Post-build client-bundle scanner (LFE-10645).
 *
 * Parses every emitted client asset and reports identifiers that are
 * REFERENCED but DECLARED NOWHERE in the file and are not known browser
 * globals. A minifier that deletes a binding while keeping a reference to it
 * (the SWC dropped-binding class that caused LFE-10640, a production-only
 * `ReferenceError` on opening a trace peek) always leaves exactly such a free
 * identifier behind — and since the minifier owns every name it emits, a
 * non-global free identifier in minified output is a miscompilation until
 * proven otherwise. The same net also catches Node/CJS leakage into browser
 * code (bare `require`, `process`, `Buffer`, …), which crashes just the same.
 *
 * Scope of the guarantee: complete for the *ReferenceError manifestation* of
 * the dropped-binding class (a deleted binding necessarily produces an
 * undeclared reference, and scope analysis finds all of them), including
 * inside vendored dependency code that no source-level lint can see. Known
 * limits: a dropped binding whose name collides with a real window property
 * (`status`, `name`, `length`, …) degrades silently instead of throwing and
 * is out of scope here, as are miscompiles that keep all bindings but fold a
 * wrong value — both need runtime exercise to detect. CI scans the e2e job's
 * build as a proxy for the release images, which minify the same sources
 * separately with different inlined NEXT_PUBLIC_* constants.
 *
 * Usage: node scripts/scan-client-bundle.mjs <static-dir>
 *   e.g. node scripts/scan-client-bundle.mjs web/.next/static
 *
 * Exit codes: 0 = clean, 1 = findings, 2 = usage / zero files / parse failure.
 *
 * If this scanner fails your build: the named binding was deleted by the
 * minifier while code still reads it. The canonical first-party fix is to
 * move the module-level const into the (single) function that reads it — see
 * the LFE-10640 fix in TraceLayoutDesktop.tsx (#14735) — and to link the
 * upstream SWC issue (swc-project/swc#11983) in a comment so the workaround
 * is deletable once fixed.
 * For vendored dependency code, change how the dependency is shipped (see the
 * prettier/plugins/typescript → babel-ts swap in #14738).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// espree and eslint-scope are CommonJS without ESM default-export interop.
const require = createRequire(import.meta.url);
const espree = require("espree");
const eslintScope = require("eslint-scope");
const globals = require("globals");

// Identifiers that legitimately appear free in minified chunks even after the
// typeof-guard exemption below. Every entry must carry a reason — this list
// is a hole in the net (it masks the name bundle-wide), keep it short.
const AMBIENT_ALLOWLIST = new Map([
  // Bundler / framework runtime names registered by the runtime chunk or the
  // host page before any app chunk executes (live in today's bundle).
  ["TURBOPACK_NEXT_CHUNK_URLS", "Turbopack chunk-URL manifest global"],
  ["__turbopack_load_page_chunks__", "Turbopack page-chunk loader"],
  // Next.js's scheduler module ships its Node code path into the client
  // chunk with two setImmediate calls that are not typeof-guarded (upstream
  // next/dist; the path is process-gated at runtime and unreached in
  // browsers). Remove when Next fixes the emission.
  ["setImmediate", "Next.js scheduler Node path in client chunk (upstream)"],
  // Devtools / observability hooks that exist only when their host injects
  // them; some reads sit behind existence checks that are not typeof-shaped.
  ["__REACT_DEVTOOLS_GLOBAL_HOOK__", "React DevTools hook"],
  ["__SENTRY_DEBUG__", "Sentry magic build flag"],
  ["__SENTRY_TRACING__", "Sentry magic build flag"],
  ["__SENTRY_BROWSER_BUNDLE__", "Sentry magic build flag"],
  ["__SENTRY_RELEASE__", "Sentry magic build flag"],
  ["__SENTRY_EXCLUDE_REPLAY_WORKER__", "Sentry replay build flag"],
  ["__RRWEB_EXCLUDE_IFRAME__", "rrweb (Sentry replay) build flag"],
  ["__RRWEB_EXCLUDE_SHADOW_DOM__", "rrweb (Sentry replay) build flag"],
  ["__nccwpck_require__", "ncc-precompiled vendored packages' runtime"],
  ["__webpack_nonce__", "webpack CSP nonce hook, read if defined"],
  ["UUIDV7_DENY_WEAK_RNG", "uuidv7 opt-in strictness global"],
  // Cross-environment feature probes in vendored libraries whose guards are
  // not typeof-shaped in the emitted code.
  ["ActiveXObject", "legacy IE probe in vendored libs"],
  ["Bun", "Bun runtime probe"],
  ["Deno", "Deno runtime probe"],
  ["AsyncIterator", "ES proposal probe in vendored libs"],
  [
    "WebKitCSSMatrix",
    "d3-interpolate fallback in a DOMMatrix-guarded alternate; a real global in engines old enough to reach it",
  ],
  [
    "$doc",
    "GWT runtime alias in elkjs, read only on an MSIE-userAgent path — undeclared in the upstream source, not a minifier drop",
  ],
  [
    "toString",
    "bare toString.call idiom resolves to globalThis's inherited Object.prototype.toString — cannot throw",
  ],
]);

// regenerator-runtime self-registers via a try/catch-guarded top-level WRITE
// (`regeneratorRuntime = r`) — that write is legitimate, but a free READ of
// this name would be a real dropped binding in Babel-compiled vendored code,
// so it must not be name-allowlisted wholesale.
const WRITE_ONLY_ALLOWLIST = new Set(["regeneratorRuntime"]);

// Browser globals that only exist in some engines (mostly Chrome-only
// APIs). A dropped binding with one of these names — `ai` and `model` are
// plausible two-char mangler output or LLM-product source names — would be
// masked by globals.browser yet throw for every Firefox/Safari user, the
// exact shape of the original incident. Zero of them appear free in today's
// bundle, so subtracting them costs nothing.
const NOT_UNIVERSALLY_PRESENT = new Set([
  "ai",
  "model",
  "fence",
  "when",
  "viewport",
  "credentialless",
  "scheduler",
]);

// Deliberately NO globals.node: `require`, `module`, `exports`, `process`,
// `Buffer`, `__dirname`, … all throw in a real browser, so a bare reference
// in a client chunk is a guaranteed crash (Node/CJS leakage) that this gate
// must catch, not mask. Runtime probes for these names are typeof-guarded in
// the emitted code and covered by the guard exemption below.
const KNOWN_GLOBALS = new Set(
  [
    ...Object.keys(globals.browser),
    ...Object.keys(globals.worker),
    ...Object.keys(globals.builtin),
  ].filter((name) => !NOT_UNIVERSALLY_PRESENT.has(name)),
);

function parseAsset(code) {
  // Module-first: every current chunk parses identically in both modes, but a
  // top-level-await chunk would misparse in script mode (`await x` becomes a
  // call of a free identifier `await`) and produce a phantom finding.
  try {
    return {
      ast: espree.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        loc: true,
        range: true,
      }),
      sourceType: "module",
    };
  } catch {
    // Sloppy-only syntax (`with`, HTML comments) in vendored code needs
    // script mode. The scope analyzer must use the same mode as the parse.
    return {
      ast: espree.parse(code, {
        ecmaVersion: "latest",
        sourceType: "script",
        loc: true,
        range: true,
      }),
      sourceType: "script",
    };
  }
}

// Collect the names probed via `typeof <name>` anywhere inside `node`.
function typeofNamesIn(node, out) {
  if (!node || typeof node.type !== "string") return out;
  if (
    node.type === "UnaryExpression" &&
    node.operator === "typeof" &&
    node.argument.type === "Identifier"
  ) {
    out.add(node.argument.name);
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((v) => typeofNamesIn(v, out));
    else if (value && typeof value.type === "string") typeofNamesIn(value, out);
  }
  return out;
}

// Record every reference range of `names` inside `node` as guard-exempt.
function exemptRefsIn(node, names, exemptRanges) {
  if (!node || typeof node.type !== "string" || names.size === 0) return;
  if (node.type === "Identifier" && names.has(node.name)) {
    exemptRanges.add(node.range[0]);
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];
    if (Array.isArray(value))
      value.forEach((v) => exemptRefsIn(v, names, exemptRanges));
    else if (value && typeof value.type === "string")
      exemptRefsIn(value, names, exemptRanges);
  }
}

/**
 * Two exemption layers for legal free-identifier reads:
 *  1. The argument of `typeof x` itself never throws.
 *  2. Guard-then-use: when a test expression probes `typeof x`, references to
 *     x inside the guarded branch are execution-gated on the probe, e.g.
 *     `"function"==typeof require?require:__require` (Turbopack runtime) or
 *     `typeof onProfilerEvent=="function"&&onProfilerEvent(e)`. Exemption is
 *     scoped to the guarded subtree only — never the whole chunk — so a
 *     dropped binding elsewhere in the file that happens to share the name
 *     still fires.
 */
function collectExemptRanges(ast) {
  const exemptRanges = new Set();
  (function walk(node) {
    if (!node || typeof node.type !== "string") return;
    if (
      node.type === "UnaryExpression" &&
      node.operator === "typeof" &&
      node.argument.type === "Identifier"
    ) {
      exemptRanges.add(node.argument.range[0]);
    } else if (node.type === "LogicalExpression") {
      exemptRefsIn(
        node.right,
        typeofNamesIn(node.left, new Set()),
        exemptRanges,
      );
    } else if (node.type === "ConditionalExpression") {
      const names = typeofNamesIn(node.test, new Set());
      exemptRefsIn(node.consequent, names, exemptRanges);
      exemptRefsIn(node.alternate, names, exemptRanges);
    } else if (node.type === "IfStatement") {
      const names = typeofNamesIn(node.test, new Set());
      exemptRefsIn(node.consequent, names, exemptRanges);
      if (node.alternate) exemptRefsIn(node.alternate, names, exemptRanges);
    }
    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value.type === "string") walk(value);
    }
  })(ast);
  return exemptRanges;
}

function scanFile(file) {
  const code = fs.readFileSync(file, "utf8");
  const { ast, sourceType } = parseAsset(code);

  const scopeManager = eslintScope.analyze(ast, {
    ecmaVersion: 2024,
    sourceType,
    ignoreEval: true,
  });

  const exemptRanges = collectExemptRanges(ast);

  // globalScope.through = references that no scope in this file resolves.
  const findings = new Map();
  for (const ref of scopeManager.globalScope.through) {
    const name = ref.identifier.name;
    if (KNOWN_GLOBALS.has(name)) continue;
    if (AMBIENT_ALLOWLIST.has(name)) continue;
    if (WRITE_ONLY_ALLOWLIST.has(name) && ref.isWrite() && !ref.isRead())
      continue;
    if (exemptRanges.has(ref.identifier.range[0])) continue;
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
if (!dir || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(
    "usage: node scripts/scan-client-bundle.mjs <static-dir>\n" +
      `  not a directory: ${dir ?? "(missing argument)"}`,
  );
  process.exit(2);
}

// Recursive walk (chunks can be emitted into subdirectories) over every JS
// flavor; regular files only, sorted for deterministic output. Missing files
// would silently narrow the gate.
const files = fs
  .readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(js|mjs|cjs)$/.test(entry.name))
  .map((entry) => path.join(entry.parentPath, entry.name))
  .sort();

if (files.length === 0) {
  // An empty scan must never pass — a build-output restructure would
  // otherwise silently disable the gate.
  console.error(`no JS files found in ${dir} — check the build output path`);
  process.exit(2);
}

const started = Date.now();
const byName = new Map();
let parseFailures = 0;
for (const file of files) {
  const relative = path.relative(dir, file);
  try {
    for (const [name, locs] of scanFile(file)) {
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push({ file: relative, locs });
    }
  } catch (error) {
    parseFailures += 1;
    const at =
      error.lineNumber != null ? ` (${error.lineNumber}:${error.column})` : "";
    console.error(`PARSE FAILED ${relative}${at}: ${error.message}`);
  }
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`scanned ${files.length} files in ${seconds}s`);

// Print findings even when some chunks failed to parse — a parse failure
// must not suppress evidence from the chunks that did parse.
if (byName.size > 0) {
  console.error(
    `\n${byName.size} undeclared identifier(s) found — the minifier likely ` +
      "deleted a binding that live code still reads (LFE-10640 class), or " +
      "Node-only code leaked into a browser chunk.\n" +
      "Each of these throws ReferenceError when the referencing line executes:\n",
  );
  for (const [name, hits] of [...byName.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.error(
      `  ${name} — ${hits.length} file(s): ${hits
        .slice(0, 4)
        .map((h) => `${h.file}:${h.locs[0]}`)
        .join(", ")}${hits.length > 4 ? ", …" : ""}`,
    );
  }
  console.error(
    "\nFix: keep the value local to its single reader (see #14735 for the " +
      "canonical fix) or restructure the shape; for vendored dependency code, " +
      "change how the dependency is shipped. See LFE-10645 for the analysis.",
  );
}

if (parseFailures > 0) {
  console.error(`\n${parseFailures} file(s) could not be parsed — failing.`);
  process.exit(2);
}

if (byName.size > 0) {
  process.exit(1);
}

console.log("clean: every referenced identifier is declared or a known global");
process.exit(0);
