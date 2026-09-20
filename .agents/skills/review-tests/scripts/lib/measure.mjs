// Measures which tests co-depend on one production symbol by stubbing that
// symbol's function body to throw and observing which referencing tests fail.
//
// The value lives in three pure functions, each unit-tested against fixtures:
// `locateExport` finds the export's body span in the module source,
// `applyStub` rewrites that span to throw a unique marker, and `parseReport`
// turns a Vitest JSON run into the failed-test rows of the contract. The
// `measure` orchestrator only composes them around a disposable source edit
// and a test run.
//
// A symbol is `<module file>#<export>` (see candidates.mjs). Scope is the
// in-process path: symbols under `packages/shared/src` that web server tests
// resolve to source via the `@langfuse/shared/src/*` alias, so a source stub
// takes effect with no dist rebuild.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { maskCode, scanTests } from "./scan-tests.mjs";

export const markerFor = (symbol) => `review-tests-stub:${symbol}`;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const lineOf = (src, offset) => {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i += 1) {
    if (src[i] === "\n") line += 1;
  }
  return line;
};

/** Next code, non-whitespace offset at or after `from`, or -1. */
function nextCode(src, isCode, from) {
  for (let i = from; i < src.length; i += 1) {
    if (isCode[i] && !/\s/.test(src[i])) return i;
  }
  return -1;
}

/** Index just past the delimiter matching the one at `open`, or -1. */
function matchDelim(src, isCode, open, close, from) {
  let depth = 0;
  for (let i = from; i < src.length; i += 1) {
    if (!isCode[i]) continue;
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** First match of `re` that starts at a code (non-string/comment) offset. */
function firstCodeMatch(re, src, isCode) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (isCode[m.index]) return m;
  }
  return null;
}

// From `from`, skips an optional generic list and one parameter list, then
// returns the body-opening `{` after any return-type annotation. Shared by
// function declarations and function expressions.
function bodyBraceAfterSignature(src, isCode, from) {
  let at = nextCode(src, isCode, from);
  if (at === -1) return -1;
  if (src[at] === "<") {
    at = matchDelim(src, isCode, "<", ">", at);
    if (at === -1) return -1;
    at = nextCode(src, isCode, at);
  }
  if (at === -1 || src[at] !== "(") return -1;
  at = matchDelim(src, isCode, "(", ")", at);
  if (at === -1) return -1;
  at = nextCode(src, isCode, at);
  while (at !== -1 && src[at] !== "{") at = nextCode(src, isCode, at + 1);
  return at;
}

const bracedBody = (src, isCode, open) => {
  const end = matchDelim(src, isCode, "{", "}", open);
  return end === -1 ? null : { bodyStart: open, bodyEnd: end };
};

// A concise arrow body is an expression, not a block. It ends at the first
// top-level `;`, `,`, or closing bracket of an enclosing construct.
function conciseBody(src, isCode, start) {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    if (!isCode[i]) continue;
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return { bodyStart: start, bodyEnd: i };
      depth -= 1;
    } else if (depth === 0 && (c === ";" || c === ",")) {
      return { bodyStart: start, bodyEnd: i };
    }
  }
  return { bodyStart: start, bodyEnd: src.length };
}

// The initializer of `export const NAME = ...` is either a function
// expression, or an arrow whose body may be a block or a bare expression.
function initializerBody(src, isCode, from) {
  let at = nextCode(src, isCode, from);
  if (at === -1) return null;
  if (src.startsWith("async", at) && !/[\w$]/.test(src[at + 5] ?? "")) {
    at = nextCode(src, isCode, at + 5);
  }
  if (at === -1) return null;

  if (src.startsWith("function", at) && !/[\w$]/.test(src[at + 8] ?? "")) {
    const open = bodyBraceAfterSignature(src, isCode, at + 8);
    return open === -1 ? null : bracedBody(src, isCode, open);
  }

  if (src[at] === "<") {
    at = matchDelim(src, isCode, "<", ">", at);
    if (at === -1) return null;
    at = nextCode(src, isCode, at);
  }
  if (at === -1) return null;
  if (src[at] === "(") {
    at = matchDelim(src, isCode, "(", ")", at);
    if (at === -1) return null;
  } else if (IDENTIFIER.test(src[at])) {
    while (at < src.length && /[\w$]/.test(src[at])) at += 1;
  } else {
    return null;
  }

  // Skip a return-type annotation up to the arrow.
  at = nextCode(src, isCode, at);
  while (at !== -1 && !(src[at] === "=" && src[at + 1] === ">")) {
    at = nextCode(src, isCode, at + 1);
  }
  if (at === -1) return null;
  const bodyAt = nextCode(src, isCode, at + 2);
  if (bodyAt === -1) return null;
  return src[bodyAt] === "{"
    ? bracedBody(src, isCode, bodyAt)
    : conciseBody(src, isCode, bodyAt);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds where a symbol's exported function is defined so its body can be
 * stubbed. Handles `export function foo(...) {...}` and
 * `export const foo = (...) => {...}` / `= function (...) {...}`, including
 * concise arrow bodies. Returns null for a member or method symbol
 * (`x#prisma.trace.findMany`) and for an export it cannot locate.
 *
 * @param {string} symbolString `<module file>#<export>`
 * @param {string} moduleSource
 * @returns {{line: number, bodyStart: number, bodyEnd: number}|null}
 */
export function locateExport(symbolString, moduleSource) {
  const name = symbolString.slice(symbolString.indexOf("#") + 1);
  if (!IDENTIFIER.test(name)) return null;

  const isCode = maskCode(moduleSource);
  const id = escapeRe(name);

  const fn = firstCodeMatch(
    new RegExp(
      `(?<![\\w$.])export\\s+(?:async\\s+)?function\\s*\\*?\\s*${id}\\b`,
      "g",
    ),
    moduleSource,
    isCode,
  );
  if (fn) {
    const open = bodyBraceAfterSignature(
      moduleSource,
      isCode,
      fn.index + fn[0].length,
    );
    const span = open === -1 ? null : bracedBody(moduleSource, isCode, open);
    return span ? { line: lineOf(moduleSource, fn.index), ...span } : null;
  }

  const decl = firstCodeMatch(
    new RegExp(`(?<![\\w$.])export\\s+const\\s+${id}\\s*=`, "g"),
    moduleSource,
    isCode,
  );
  if (decl) {
    const span = initializerBody(
      moduleSource,
      isCode,
      decl.index + decl[0].length,
    );
    return span ? { line: lineOf(moduleSource, decl.index), ...span } : null;
  }

  return null;
}

/**
 * Replaces the body at `bodySpan` with a throw of `marker`, so the module
 * still imports and only a test that calls the symbol at runtime hits it.
 *
 * @param {string} moduleSource
 * @param {{bodyStart: number, bodyEnd: number}} bodySpan
 * @param {string} marker
 * @returns {string}
 */
export function applyStub(moduleSource, bodySpan, marker) {
  const throwing = `{ throw new Error(${JSON.stringify(marker)}); }`;
  return (
    moduleSource.slice(0, bodySpan.bodyStart) +
    throwing +
    moduleSource.slice(bodySpan.bodyEnd)
  );
}

const PLACEHOLDER = /%[%#sdifjoOc]|\$[\w$]/;

// A parameterized block's name carries printf (`%s`, `%#`) or object (`$id`)
// placeholders; every runtime case's reported name matches the same pattern,
// so they collapse to the one block.
function templateToRegExp(name) {
  let pattern = "^";
  for (let i = 0; i < name.length; ) {
    const c = name[i];
    if (c === "%") {
      const next = name[i + 1];
      if (next === "%") pattern += "%";
      else if (next === "#") pattern += "\\d+";
      else if ("sdifjoOc".includes(next)) pattern += ".*?";
      else {
        pattern += "%";
        i += 1;
        continue;
      }
      i += 2;
      continue;
    }
    const object = c === "$" && /^\$[\w$]+(?:\.[\w$]+)*/.exec(name.slice(i));
    if (object) {
      pattern += ".*?";
      i += object[0].length;
      continue;
    }
    pattern += escapeRe(c);
    i += 1;
  }
  return new RegExp(`${pattern}$`);
}

const nameMatches = (blockName, reportName) =>
  blockName === reportName ||
  (PLACEHOLDER.test(blockName) && templateToRegExp(blockName).test(reportName));

// A block's repo-relative file names the same file as the report's absolute
// path when it is a path suffix on a segment boundary.
const sameFile = (blockFile, reportFile) =>
  reportFile === blockFile || reportFile.endsWith(`/${blockFile}`);

/**
 * Turns a Vitest JSON run into the failed-test rows of the contract. A failed
 * assertion becomes one row; `marker` is whether its failure message carried
 * the stub marker. Parameterized cases collapse to their block's single
 * `(file, line)`, keeping `marker: true` if any case carried the marker.
 * Passing tests are omitted.
 *
 * @param {{testResults: Array}} vitestJson
 * @param {string} marker
 * @param {Array<{file: string, name: string, line: number}>} blockTable
 * @returns {Array<{marker: boolean, file: string, line: number}>}
 */
export function parseReport(vitestJson, marker, blockTable) {
  const rows = new Map();
  for (const suite of vitestJson.testResults ?? []) {
    for (const assertion of suite.assertionResults ?? []) {
      if (assertion.status !== "failed") continue;
      const reportName =
        assertion.fullName ??
        [...(assertion.ancestorTitles ?? []), assertion.title].join(" ");
      const block = blockTable.find(
        (b) => sameFile(b.file, suite.name) && nameMatches(b.name, reportName),
      );
      if (!block) continue;
      const hit = (assertion.failureMessages ?? []).some((message) =>
        message.includes(marker),
      );
      const key = `${block.file}\n${block.line}`;
      const existing = rows.get(key);
      if (existing) existing.marker ||= hit;
      else rows.set(key, { marker: hit, file: block.file, line: block.line });
    }
  }
  return [...rows.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

// Each referencing test's block name is spelled as Vitest reports it: the
// ancestor titles and the title, space-joined.
function blockTableFor(tests, repoRoot) {
  const table = [];
  for (const { file } of tests) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    for (const t of scanTests(source, file).tests) {
      table.push({
        file,
        name: [...t.describePath, t.title].join(" "),
        line: t.line,
      });
    }
  }
  return table;
}

// Runs one test file with the JSON reporter and returns the parsed report.
// Vitest exits non-zero when tests fail — expected, since the stub is meant to
// fail them — so the exit code is ignored and the written report is the signal;
// a missing or unparseable report throws, which the caller treats as a crash.
function defaultRunFile(runCommand, repoRoot) {
  const dir = mkdtempSync(join(tmpdir(), "review-tests-"));
  const outFile = join(dir, "report.json");
  try {
    spawnSync(
      "bash",
      ["-c", `${runCommand} --reporter=json --outputFile='${outFile}'`],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 1 << 28,
      },
    );
    return JSON.parse(readFileSync(outFile, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Stubs one symbol's function body to throw a unique marker, runs the tests
 * that reference it, and reports which failed. `ok: false` only when no
 * trustworthy per-test results could be produced — the export could not be
 * located or stubbed, or a runner crashed. Individual test failures are the
 * result, not an error.
 *
 * @param {object} args
 * @param {string} args.symbol `<module file>#<export>`
 * @param {Array<{file: string, runCommand: string}>} args.tests referencing tests
 * @param {string} [args.repoRoot]
 * @param {(runCommand: string, repoRoot: string) => object} [args.runFile] injectable runner
 * @returns {Promise<object>} the measurement contract
 */
export async function measure({
  symbol,
  tests,
  repoRoot = process.cwd(),
  runFile = defaultRunFile,
}) {
  const cannotLocate = {
    ok: false,
    error: "could not locate export definition to stub",
  };
  const modulePath = join(repoRoot, symbol.slice(0, symbol.indexOf("#")));

  let original;
  try {
    original = readFileSync(modulePath, "utf8");
  } catch {
    return cannotLocate;
  }
  const span = locateExport(symbol, original);
  if (!span) return cannotLocate;

  const marker = markerFor(symbol);
  const blockTable = blockTableFor(tests, repoRoot);

  writeFileSync(modulePath, applyStub(original, span, marker));
  const suites = [];
  try {
    for (const { file, runCommand } of tests) {
      let report;
      try {
        report = runFile(runCommand, repoRoot);
      } catch (error) {
        return {
          ok: false,
          error: `runner crashed for ${file}: ${error.message}`,
        };
      }
      if (!report || !Array.isArray(report.testResults)) {
        return { ok: false, error: `no per-test results for ${file}` };
      }
      suites.push(...report.testResults);
    }
  } finally {
    writeFileSync(modulePath, original);
  }

  return {
    ok: true,
    code: { symbol, line: span.line },
    tests: parseReport({ testResults: suites }, marker, blockTable),
  };
}
