// Picks the tests most likely to already cover a changed test.
//
// The unit of comparison is the production *function* a test calls, not the
// file it imports. Every worker test imports `@langfuse/shared/src/server`, so
// file overlap says nothing; two tests that both call
// `getGenerationsForAnalyticsIntegrations(` very likely fail together. Symbols
// are weighted by how many test files use them, so fixture helpers every test
// calls — `createOrgProjectAndApiKey` — count for almost nothing.

import { maskCode } from "./scan-tests.mjs";

export const TEST_FILE_RE = /\.(test|servertest|clienttest)\.(ts|tsx)$/;
const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];
const INDEX_EXTENSIONS = ["/index.ts", "/index.tsx", "/index.js"];

const ALIASES = [
  { prefix: "@langfuse/shared/src/", to: "packages/shared/src/" },
  { prefix: "@langfuse/shared", to: "packages/shared/src/index" },
  { prefix: "@langfuse/ee/", to: "ee/src/" },
  { prefix: "@langfuse/ee", to: "ee/src/index" },
];

/** The workspace root a repo-relative file belongs to, e.g. `web`. */
export function packageRootOf(file) {
  const parts = file.split("/");
  return parts[0] === "packages" ? `${parts[0]}/${parts[1]}` : parts[0];
}

function normalize(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * Resolves an import specifier to a repo-relative file.
 * @param {string} spec
 * @param {string} fromFile repo-relative importer
 * @param {(path: string) => boolean} exists
 * @returns {string|null} null for node/third-party modules and unresolvable paths
 */
export function resolveImport(spec, fromFile, exists) {
  let base = null;

  if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    base = normalize(`${dir}/${spec}`);
  } else if (spec.startsWith("@/")) {
    base = normalize(`${packageRootOf(fromFile)}/${spec.slice(2)}`);
  } else {
    const alias = ALIASES.find(
      (a) => spec === a.prefix || spec.startsWith(a.prefix),
    );
    if (!alias) return null;
    base = normalize(spec.replace(alias.prefix, alias.to));
  }

  // A specifier may already carry an extension, need one, or name a directory.
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = base + ext;
    if (candidate && exists(candidate)) return candidate;
  }
  for (const ext of INDEX_EXTENSIONS) {
    if (exists(base + ext)) return base + ext;
  }
  return null;
}

/** Resolvable, non-test modules a test file imports. */
export function productionTargets(imports, fromFile, exists) {
  const out = new Set();
  for (const spec of imports) {
    const resolved = resolveImport(spec, fromFile, exists);
    if (resolved && !TEST_FILE_RE.test(resolved)) out.add(resolved);
  }
  return [...out];
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Production symbols a test body calls, qualified by the module that provides
 * them: `packages/shared/src/server/index.ts#createTrace`. A namespace import's
 * members and an object binding's methods (`prisma.trace.findMany(`) qualify
 * as `module#binding.member`. JSX usage counts as a call, so client tests
 * rendering a component share a symbol with every other test of it.
 *
 * @param {string} source one test's source
 * @param {Array<{local: string, imported: string, spec: string}>} bindings
 * @param {string} file the test file, for import resolution
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export function callSymbols(source, bindings, file, exists) {
  const isCode = maskCode(source);
  const atCode = (re) => {
    const found = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source)) !== null) if (isCode[m.index]) found.push(m);
    return found;
  };

  const out = new Set();
  for (const b of bindings) {
    const module = resolveImport(b.spec, file, exists);
    if (!module || TEST_FILE_RE.test(module)) continue;
    const local = escapeRe(b.local);
    const name = b.imported === "*" ? null : b.imported;

    if (name && atCode(new RegExp(`(?<![\\w$.])${local}\\s*\\(`, "g")).length) {
      out.add(`${module}#${name}`);
    }
    if (name && atCode(new RegExp(`<${local}(?![\\w$])`, "g")).length) {
      out.add(`${module}#${name}`);
    }
    const members = atCode(
      new RegExp(`(?<![\\w$.])${local}\\.([\\w$]+(?:\\.[\\w$]+)*)\\s*\\(`, "g"),
    );
    for (const m of members) {
      out.add(name ? `${module}#${name}.${m[1]}` : `${module}#${m[1]}`);
    }
  }
  return [...out].sort();
}

/**
 * Inverts per-test symbol lists into symbol → set of test files, so a symbol's
 * breadth of use is known.
 * @param {Map<string, {file: string, symbols: string[]}>} byTestId
 */
export function buildSymbolIndex(byTestId) {
  const index = new Map();
  for (const { file, symbols } of byTestId.values()) {
    for (const sym of symbols) {
      if (!index.has(sym)) index.set(sym, new Set());
      index.get(sym).add(file);
    }
  }
  return index;
}

/** A symbol called from many test files is weak evidence of redundancy. */
export function symbolWeight(index, sym) {
  const breadth = index.get(sym)?.size ?? 1;
  return 1 / Math.log2(breadth + 1);
}

/**
 * Ranks tests in other files by weighted shared symbols with `target`,
 * descending.
 * @returns {Array<{test, overlap: number, shared: string[]}>}
 */
export function rankTests({ target, byTestId, index }) {
  const mine = new Set(byTestId.get(target.id)?.symbols ?? []);
  if (!mine.size) return [];
  const scored = [];
  for (const [id, entry] of byTestId) {
    if (entry.file === target.file) continue;
    const shared = entry.symbols.filter((s) => mine.has(s));
    if (!shared.length) continue;
    const overlap = shared.reduce((sum, s) => sum + symbolWeight(index, s), 0);
    scored.push({
      test: entry.test,
      overlap: Number(overlap.toFixed(4)),
      shared,
    });
  }
  return scored.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      a.test.file.localeCompare(b.test.file) ||
      a.test.line - b.test.line,
  );
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "is",
  "are",
  "be",
  "to",
  "of",
  "for",
  "with",
  "when",
  "then",
  "it",
  "its",
  "that",
  "this",
  "should",
  "does",
  "do",
  "not",
  "no",
  "returns",
  "return",
  "given",
]);

/** Tokens shared between two test names or assertion lists, as a 0..1 ratio. */
export function similarity(a, b) {
  const tokens = (text) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
    );
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const t of left) if (right.has(t)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

const fingerprint = (test) => `${test.name} ${test.assertions.join(" ")}`;

/**
 * Chooses the candidate tests shown to a judge. Siblings in the same file get
 * up to half the budget — two tests that can only fail together usually sit
 * next to each other — ordered by shared symbols, then by name and assertion
 * similarity. Ranked tests from other files fill the rest, at most two per
 * file so one large suite cannot crowd out every other source.
 *
 * @returns {Array<{id, file, name, line, source, overlap, basis, sharedSymbols}>}
 */
export function selectCandidates({
  target,
  testsByFile,
  byTestId,
  index,
  limit = 5,
}) {
  const out = [];
  const siblingBudget = Math.ceil(limit / 2);
  const mine = new Set(byTestId.get(target.id)?.symbols ?? []);

  // A rarely-shared production call is strong evidence and outweighs any name
  // match; a helper every test calls weighs so little that a near-identical
  // name and assertion list wins instead. Symbol weight is doubled so a
  // function shared by only two files (weight 0.63) beats a perfect word match.
  const siblings = (testsByFile.get(target.file) ?? [])
    .filter((t) => t.id !== target.id)
    .map((t) => {
      const shared = (byTestId.get(t.id)?.symbols ?? []).filter((s) =>
        mine.has(s),
      );
      const symbolScore = shared.reduce(
        (sum, s) => sum + symbolWeight(index, s),
        0,
      );
      const words = similarity(fingerprint(target), fingerprint(t));
      return { test: t, shared, score: 2 * symbolScore + words };
    })
    .sort((a, b) => b.score - a.score || a.test.line - b.test.line)
    .slice(0, siblingBudget);

  for (const { test, shared, score } of siblings) {
    out.push({
      ...pick(test),
      overlap: Number(score.toFixed(4)),
      basis: "sibling",
      sharedSymbols: shared,
    });
  }

  const perFile = new Map();
  for (const entry of rankTests({ target, byTestId, index })) {
    if (out.length >= limit) break;
    const used = perFile.get(entry.test.file) ?? 0;
    if (used >= 2) continue;
    perFile.set(entry.test.file, used + 1);
    out.push({
      ...pick(entry.test),
      overlap: entry.overlap,
      basis: "symbols",
      sharedSymbols: entry.shared,
    });
  }

  return out.slice(0, limit);
}

const pick = (t) => ({
  id: t.id,
  file: t.file,
  name: t.name,
  line: t.line,
  source: t.source,
});
